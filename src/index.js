import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Liquid } from 'liquidjs';
import puppeteer from 'puppeteer';
import { validateXML } from 'xmllint-wasm';

const liquid = new Liquid();

function xmlEscape(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function escapeAll(data) {
    const out = {};
    for (const [k, v] of Object.entries(data)) {
        out[k] = v == null ? '' : xmlEscape(v);
    }
    return out;
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// Hash of the rendered SVG — the exact bytes that would be screenshotted.
// This captures BOTH data changes (different interpolated values) and template
// changes (Eleventy re-reads and re-parses the .svg every rebuild), so a stable
// hash means the resulting PNG would be byte-for-byte the same as last time.
const hashSvg = svg => crypto.createHash('sha1').update(svg).digest('hex');

const fileExists = p =>
    fs.access(p).then(
        () => true,
        () => false,
    );

// Minimal semaphore so we can bound how many Chromium tabs are open at once.
// Eleventy renders pages in parallel; with a large site that produced ~50
// concurrent `browser.newPage()` calls, which is enough to starve a GitHub
// Actions runner (limited CPU, limited /dev/shm, no GPU) and make
// `Page.captureScreenshot` stall until puppeteer's 180s protocolTimeout.
function createSemaphore(limit) {
    let active = 0;
    const waiters = [];
    const acquire = () => {
        if (active < limit) {
            active++;
            return Promise.resolve();
        }
        return new Promise(resolve => waiters.push(resolve));
    };
    const release = () => {
        const next = waiters.shift();
        if (next) next();
        else active--;
    };
    return async task => {
        await acquire();
        try {
            return await task();
        } finally {
            release();
        }
    };
}

const CARD_DEFAULTS = {
    outputDir: '_site/img/social-cards',
    urlPath: '/img/social-cards',
    viewport: { width: 1200, height: 630 },
    delay: 100,
    escape: true,
    filename: page => `${page.fileSlug}.png`,
};

const DEFAULT_VARIANT = '__default';

function prefix(suffix) {
    return `[eleventy-plugin-svg-social-card] ${suffix}`;
}

// Inkscape URL-encodes curly braces inside attribute values on save, turning
// `{{ name }}` into `%7B%7B%20name%20%7D%7D`. The SVG is still valid XML, so
// xmllint-wasm doesn't flag it, but Liquid never sees a placeholder and the
// attribute renders as a literal URL-encoded string. Warn loudly so the user
// can un-escape it in a text editor.
function warnOnUrlEncodedBraces(src, templatePath, cardName) {
    const pattern = /%7B%7B|%7D%7D/gi;
    if (!pattern.test(src)) return;

    const lines = src.split('\n');
    const affected = new Set();
    for (let i = 0; i < lines.length; i++) {
        if (/%7B%7B|%7D%7D/i.test(lines[i])) {
            affected.add(i + 1);
        }
    }

    const label = cardName ? `card "${cardName}" (${templatePath})` : templatePath;
    console.warn(
        prefix(
            `WARNING: ${label} contains URL-encoded Liquid placeholders on ` +
                `line(s) ${[...affected].join(', ')}. This usually happens when ` +
                `Inkscape saves {{ ... }} inside an attribute (xlink:href, href, etc.). ` +
                `Replace "%7B%7B%20" with "{{ " and "%20%7D%7D" with " }}" in a text ` +
                `editor to restore templating — otherwise the rendered card will ` +
                `contain the literal encoded string.`,
        ),
    );
}

export default function socialCardPlugin(eleventyConfig, userOptions = {}) {
    const shortcodeName = userOptions.shortcode ?? 'card';
    const isMulti = userOptions.cards != null;

    const rawVariants = isMulti ? userOptions.cards : { [DEFAULT_VARIANT]: userOptions };

    const variants = {};
    for (const [name, v] of Object.entries(rawVariants)) {
        if (isMulti && name === 'emit') {
            throw new Error(
                prefix(
                    `card name "emit" is reserved (it's the flag that makes ` +
                        `{% ${shortcodeName} "emit" %} return the URL). Rename the card.`,
                ),
            );
        }
        if (!v || typeof v !== 'object') {
            throw new Error(
                prefix(
                    `card "${name}" must be an object with \`template\` and \`data\`.`,
                ),
            );
        }
        if (!v.template) {
            throw new Error(
                prefix(
                    isMulti
                        ? `card "${name}" is missing required \`template\` option.`
                        : '`template` option is required (path to your .svg file).',
                ),
            );
        }
        if (typeof v.data !== 'function') {
            throw new Error(
                prefix(
                    isMulti
                        ? `card "${name}" is missing required \`data\` function.`
                        : '`data` option must be a function that returns the template variables.',
                ),
            );
        }
        variants[name] = { ...CARD_DEFAULTS, ...v, parsed: null };
    }

    // `enabled` toggles card generation. It's either a boolean or a predicate
    // that receives Eleventy's `eleventy.before` payload (`{ runMode, ... }`),
    // so you can skip the (expensive) browser render during `--watch`/`--serve`
    // and only pay for it on a real `build`. Default: always on.
    const enabledOption = userOptions.enabled ?? true;
    let generationEnabled = true;

    // In-memory render cache: output-PNG path -> hash of the rendered SVG that
    // produced it. It lives in this plugin closure, so it PERSISTS across
    // `--watch`/`--serve` rebuilds. On a rebuild, a card whose rendered SVG
    // hashes the same as last time is skipped entirely — no temp file, no
    // browser tab. That's what makes watch mode fast: only cards whose data or
    // template actually changed get re-screenshotted.
    const useCache = userOptions.cache ?? true;
    const renderCache = new Map();

    let browser;
    let ownBrowser = false;
    // The browser is launched lazily (on the first cache miss), not in
    // `eleventy.before`. A rebuild that changes nothing never starts Chromium
    // at all. `browserPromise` de-dupes concurrent launches under `concurrency`.
    let browserPromise = null;

    async function ensureBrowser() {
        if (browser) return browser;
        if (!browserPromise) {
            browserPromise = (async () => {
                if (userOptions.browser) {
                    browser = await userOptions.browser();
                    ownBrowser = false;
                } else {
                    // Default Chromium flags chosen for CI robustness:
                    //   --no-sandbox              : GitHub Actions containers
                    //                               have no user namespaces for
                    //                               the Chromium sandbox.
                    //   --disable-dev-shm-usage   : /dev/shm is ~64MB on CI;
                    //                               without this, screenshot
                    //                               calls stall.
                    //   --disable-gpu             : no GPU on CI — software path
                    //                               is more predictable.
                    // `protocolTimeout` is clamped to 60s so a stuck render
                    // fails well before a CI job's wall-clock timeout.
                    // `launchOptions` lets users override any of these.
                    browser = await puppeteer.launch({
                        headless: 'new',
                        args: [
                            '--no-sandbox',
                            '--disable-dev-shm-usage',
                            '--disable-gpu',
                        ],
                        protocolTimeout: 60_000,
                        ...(userOptions.launchOptions ?? {}),
                    });
                    ownBrowser = true;
                }
                return browser;
            })();
        }
        return browserPromise;
    }

    // `concurrency: 1` is the safe default — sequential renders are still
    // fast (an SVG → PNG screenshot is tens of milliseconds) and they avoid
    // the "stampede of tabs" failure mode on CI. Raise it if you've profiled
    // your build and know your runner can cope.
    const concurrencyLimit = Math.max(1, Number(userOptions.concurrency) || 1);
    const withSlot = createSemaphore(concurrencyLimit);

    eleventyConfig.on('eleventy.before', async info => {
        generationEnabled =
            typeof enabledOption === 'function'
                ? !!enabledOption(info ?? {})
                : !!enabledOption;

        if (!generationEnabled) {
            // Skip template parsing, XML validation and the browser launch —
            // the whole reason to disable is to make dev rebuilds fast. The
            // shortcode still resolves `emit` to a URL (see `renderCard`), so
            // meta tags keep working; the PNG just isn't (re)generated.
            const mode = info?.runMode ? ` (runMode: ${info.runMode})` : '';
            console.log(prefix(`card generation disabled — skipping renders${mode}`));
            return;
        }

        for (const [name, v] of Object.entries(variants)) {
            const src = await fs.readFile(v.template, 'utf8');

            warnOnUrlEncodedBraces(src, v.template, isMulti ? name : null);

            v.parsed = liquid.parse(src);

            const probe = await liquid.render(v.parsed, {});
            const result = await validateXML({
                xml: probe,
                normalization: 'format',
            });
            if (!result.valid) {
                const msg = result.errors[0]?.message ?? 'unknown XML error';
                const label = isMulti ? `card "${name}" (${v.template})` : v.template;
                throw new Error(
                    prefix(`SVG template renders invalid XML (${label}): ${msg}`),
                );
            }
        }

        // The browser is NOT launched here — `ensureBrowser()` starts it on the
        // first cache miss. If every card is unchanged this build, Chromium
        // never runs.
    });

    eleventyConfig.on('eleventy.after', async () => {
        if (browser && ownBrowser) {
            // Race close against a hard timeout. If the browser's renderer
            // processes are zombies, `browser.close()` can hang on the CDP
            // round-trip and keep the Node process alive indefinitely —
            // which is what made failing CI builds run until the job
            // timeout instead of exiting with a clear error.
            await Promise.race([
                browser.close().catch(() => {}),
                new Promise(resolve => setTimeout(resolve, 10000)),
            ]);
            try {
                const proc = browser.process?.();
                if (proc && proc.exitCode === null) {
                    proc.kill('SIGKILL');
                }
            } catch {}
            browser = null;
            // Drop the memoised launch so the next rebuild that has changes
            // starts a fresh browser via `ensureBrowser()`.
            browserPromise = null;
        }
    });

    async function renderCard(variantName, emit, ctx, page) {
        let name;
        if (isMulti) {
            const keys = Object.keys(variants);
            if (!variantName) {
                if (keys.length === 1) {
                    name = keys[0];
                } else {
                    throw new Error(
                        prefix(
                            `{% ${shortcodeName} %} requires a card name. ` +
                                `Try {% ${shortcodeName} "${keys[0]}" %}. ` +
                                `Available cards: ${keys.join(', ')}.`,
                        ),
                    );
                }
            } else if (!variants[variantName]) {
                throw new Error(
                    prefix(
                        `unknown card "${variantName}". ` +
                            `Available cards: ${keys.join(', ')}.`,
                    ),
                );
            } else {
                name = variantName;
            }
        } else {
            name = DEFAULT_VARIANT;
        }

        const v = variants[name];
        const filename = v.filename(page);

        // When generation is disabled we do no work here — no `data()` call,
        // no Liquid render, no browser. `emit` still hands back the URL so the
        // page's `og:image`/`twitter:image` tags stay valid in dev (they point
        // at whatever card the last real build produced).
        if (!generationEnabled) {
            if (emit) {
                return path.posix.join(v.urlPath, filename);
            }
            return;
        }

        const raw = await v.data(ctx, page);
        if (!raw || typeof raw !== 'object') {
            throw new Error(
                prefix(
                    `\`data\` must return an object; got ${typeof raw} ` +
                        `for page ${page.inputPath}`,
                ),
            );
        }
        const vars = v.escape ? escapeAll(raw) : raw;
        const rendered = await liquid.render(v.parsed, vars);

        const outPath = path.join(v.outputDir, filename);
        const relOut = path.relative(process.cwd(), outPath);

        // Cache gate: if the rendered SVG hashes the same as the last one we
        // screenshotted to this path AND that PNG still exists, there's nothing
        // to do. This is what keeps `--watch` cheap — the browser is never even
        // launched for a card that didn't change. We still verify the file is
        // on disk so deleting `_site` (or a first run) forces a regenerate.
        const hash = useCache ? hashSvg(rendered) : null;
        if (
            useCache &&
            renderCache.get(outPath) === hash &&
            (await fileExists(outPath))
        ) {
            console.log(
                `[11ty] Skipping ${relOut} from ${page.inputPath} (social-card, unchanged)`,
            );
            if (emit) {
                return path.posix.join(v.urlPath, filename);
            }
            return;
        }

        const tmpSvg = path.join(
            process.cwd(),
            `tmp-social-card-${name}-${filename.replace(/[^\w.-]/g, '_')}.svg`,
        );
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(tmpSvg, rendered);

        // Only hold the semaphore around the browser work — the Liquid
        // render and fs writes above are cheap and parallel-safe. The browser
        // is launched lazily here, on the first card that actually needs it.
        await withSlot(async () => {
            const b = await ensureBrowser();
            const browserPage = await b.newPage();
            try {
                await browserPage.setViewport(v.viewport);
                await browserPage.goto('file://' + tmpSvg);
                if (v.delay > 0) {
                    await delay(v.delay);
                }
                await browserPage.screenshot({ path: outPath });
            } finally {
                // Swallow close errors: if Chromium already discarded this
                // target (e.g. under memory pressure on CI), the screenshot
                // above either succeeded or threw — the close failure itself
                // is cleanup noise.
                await browserPage.close().catch(() => {});
                await fs.unlink(tmpSvg).catch(() => {});
            }
        });

        // Record the hash only after a successful screenshot, so a failed
        // render doesn't poison the cache and skip the retry next time.
        if (useCache) {
            renderCache.set(outPath, hash);
        }

        console.log(`[11ty] Writing ${relOut} from ${page.inputPath} (social-card)`);

        if (emit) {
            return path.posix.join(v.urlPath, filename);
        }
    }

    const EMIT = 'emit';

    eleventyConfig.addAsyncShortcode(shortcodeName, async function (arg1, arg2) {
        // Accept `emit` as the flag in either position:
        //   {% card %}                   → render, no output
        //   {% card "emit" %}            → render, return URL
        //   {% card "article" %}         → render article variant, no output
        //   {% card "article" "emit" %}  → render article variant, return URL
        let variantName, emit;
        if (arg1 === EMIT) {
            variantName = undefined;
            emit = true;
        } else {
            variantName = arg1;
            emit = arg2 === EMIT;
        }

        const ctx = this.ctx?.environments ?? {};
        const page = this.page ?? {};
        // Let errors propagate. The previous version closed the entire
        // browser on any shortcode failure, which cascaded to every other
        // in-flight render when Eleventy builds pages in parallel
        // (one page's hiccup killed the whole browser, making every other
        // page's `browserPage.close()` error with "No target" too).
        // Cleanup now happens in `eleventy.after` for both success and
        // error paths.
        const result = await renderCard(variantName, emit, ctx, page);
        return result ?? '';
    });
}

export { xmlEscape };

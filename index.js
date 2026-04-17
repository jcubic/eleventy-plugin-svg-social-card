import fs from 'node:fs/promises';
import path from 'node:path';
import { Liquid } from 'liquidjs';
import { chromium } from 'playwright';

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

export default function socialCardPlugin(eleventyConfig, userOptions = {}) {
    const options = {
        template: null,
        shortcode: 'socialCard',
        outputDir: '_site/img/social-cards',
        urlPath: '/img/social-cards',
        viewport: { width: 1200, height: 630 },
        delay: 100,
        escape: true,
        data: null,
        filename: page => `${page.fileSlug}.png`,
        browser: null,
        ...userOptions,
    };

    if (!options.template) {
        throw new Error(
            '[eleventy-plugin-svg-social-card] `template` option is required ' +
            '(path to your .svg file, relative to the Eleventy project root).'
        );
    }
    if (typeof options.data !== 'function') {
        throw new Error(
            '[eleventy-plugin-svg-social-card] `data` option must be a function ' +
            'that returns the variables to render into the SVG template.'
        );
    }

    let parsedTemplate;
    let browser;
    let ownBrowser = false;

    eleventyConfig.on('eleventy.before', async () => {
        const src = await fs.readFile(options.template, 'utf8');
        parsedTemplate = liquid.parse(src);

        if (options.browser) {
            browser = await options.browser();
            ownBrowser = false;
        } else {
            browser = await chromium.launch({ args: ['--no-sandbox'] });
            ownBrowser = true;
        }
    });

    eleventyConfig.on('eleventy.after', async () => {
        if (browser && ownBrowser) {
            await browser.close();
            browser = null;
        }
    });

    eleventyConfig.addAsyncShortcode(options.shortcode, async function() {
        const ctx = this.ctx?.environments ?? {};
        const page = this.page ?? {};

        const raw = await options.data.call(this, ctx, page);
        if (!raw || typeof raw !== 'object') {
            throw new Error(
                `[eleventy-plugin-svg-social-card] \`data\` must return an object; ` +
                `got ${typeof raw} for page ${page.inputPath}`
            );
        }
        const vars = options.escape ? escapeAll(raw) : raw;

        const rendered = await liquid.render(parsedTemplate, vars);

        const filename = options.filename(page);
        const tmpSvg = path.join(
            process.cwd(),
            `tmp-social-card-${filename.replace(/[^\w.-]/g, '_')}.svg`
        );
        const outPath = path.join(options.outputDir, filename);
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(tmpSvg, rendered);

        const browserPage = await browser.newPage({ viewport: options.viewport });
        try {
            await browserPage.goto('file://' + tmpSvg);
            if (options.delay > 0) {
                await delay(options.delay);
            }
            await browserPage.screenshot({ path: outPath });
        } finally {
            await browserPage.close();
            await fs.unlink(tmpSvg).catch(() => {});
        }

        const url = path.posix.join(options.urlPath, filename);
        return url;
    });
}

export { xmlEscape };

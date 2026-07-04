import fs from 'node:fs/promises';

// A minimal stand-in for Eleventy's config object. It captures the hooks and
// shortcode the plugin registers so tests can fire them directly.
export function makeFakeConfig() {
    const handlers = {};
    let shortcode;
    let shortcodeName;
    return {
        cfg: {
            on(event, fn) {
                (handlers[event] ??= []).push(fn);
            },
            addAsyncShortcode(name, fn) {
                shortcodeName = name;
                shortcode = fn;
            },
            addFilter() {},
        },
        // Fire an Eleventy lifecycle event (e.g. 'eleventy.before').
        async fire(event, arg) {
            for (const fn of handlers[event] ?? []) await fn(arg);
        },
        // Invoke the registered shortcode with the same `this` Eleventy provides.
        call(page, ...args) {
            return shortcode.apply({ ctx: { environments: {} }, page }, args);
        },
        get shortcodeName() {
            return shortcodeName;
        },
    };
}

// A fake Puppeteer browser: it never launches Chromium, it just records how
// often it was launched and screenshotted, captures the rendered SVG it was
// asked to open, and writes a stub PNG so the cache's on-disk check passes.
export function makeFakeBrowser() {
    const counters = { launches: 0, screenshots: 0, svgs: [] };
    const factory = async () => {
        counters.launches++;
        return {
            async newPage() {
                return {
                    async setViewport() {},
                    async goto(url) {
                        counters.svgs.push(
                            await fs.readFile(url.replace('file://', ''), 'utf8'),
                        );
                    },
                    async screenshot({ path }) {
                        counters.screenshots++;
                        await fs.writeFile(path, 'PNG');
                    },
                    async close() {},
                };
            },
            process() {
                return { exitCode: 0 };
            },
            async close() {},
        };
    };
    return { factory, counters };
}

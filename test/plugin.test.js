import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import socialCardPlugin, { xmlEscape } from '../src/index.js';
import { makeFakeConfig, makeFakeBrowser } from './helpers.js';

const FIX = path.join(import.meta.dirname, 'fixtures');
const template = path.join(FIX, 'card.svg');
const outputDir = path.join(import.meta.dirname, '.tmp');
const urlPath = '/cards';
const page = { fileSlug: 'hello', inputPath: './hello.md' };

// Register the plugin with a fake browser + sensible test defaults.
function setup(options = {}) {
    const t = makeFakeConfig();
    const { factory, counters } = makeFakeBrowser();
    socialCardPlugin(t.cfg, {
        template,
        outputDir,
        urlPath,
        data: () => ({ title: 'Hello', author: 'Ada', date: '2026' }),
        delay: 0,
        browser: factory,
        ...options,
    });
    return { ...t, counters };
}

beforeEach(() => {
    // Keep the browser's `[11ty] Writing …` chatter out of the test output.
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(outputDir, { recursive: true, force: true });
});

describe('option validation (at registration)', () => {
    const cfg = () => makeFakeConfig().cfg;

    it('requires a template in single-card mode', () => {
        expect(() => socialCardPlugin(cfg(), { data: () => ({}) })).toThrow(
            /`template` option is required/,
        );
    });

    it('requires data to be a function', () => {
        expect(() => socialCardPlugin(cfg(), { template, data: {} })).toThrow(
            /`data` option must be a function/,
        );
    });

    it('rejects a card variant named "emit"', () => {
        expect(() =>
            socialCardPlugin(cfg(), {
                cards: { emit: { template, data: () => ({}) } },
            }),
        ).toThrow(/reserved/);
    });

    it('rejects a non-object card variant', () => {
        expect(() => socialCardPlugin(cfg(), { cards: { a: 'nope' } })).toThrow(
            /must be an object/,
        );
    });

    it('reports a card missing its template', () => {
        expect(() =>
            socialCardPlugin(cfg(), {
                cards: { a: { data: () => ({}) } },
            }),
        ).toThrow(/card "a" is missing required `template`/);
    });

    it('reports a card missing its data function', () => {
        expect(() =>
            socialCardPlugin(cfg(), {
                cards: { a: { template } },
            }),
        ).toThrow(/card "a" is missing required `data`/);
    });
});

describe('template validation (eleventy.before)', () => {
    it('throws on a template that renders invalid XML', async () => {
        const t = setup({ template: path.join(FIX, 'invalid.svg') });
        await expect(t.fire('eleventy.before', { runMode: 'build' })).rejects.toThrow(
            /invalid XML/,
        );
    });

    it('warns about URL-encoded Liquid braces', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const t = setup({
            template: path.join(FIX, 'encoded.svg'),
            data: () => ({ avatar: '/a' }),
        });
        await t.fire('eleventy.before', { runMode: 'build' });
        expect(warn).toHaveBeenCalledWith(
            expect.stringMatching(/URL-encoded Liquid placeholders/),
        );
    });
});

describe('rendering', () => {
    it('writes a PNG and returns nothing without "emit"', async () => {
        const t = setup();
        await t.fire('eleventy.before', { runMode: 'build' });
        const out = await t.call(page);
        expect(out).toBe('');
        expect(t.counters.screenshots).toBe(1);
        await expect(
            fs.access(path.join(outputDir, 'hello.png')),
        ).resolves.toBeUndefined();
    });

    it('returns the URL with "emit"', async () => {
        const t = setup();
        await t.fire('eleventy.before', { runMode: 'build' });
        expect(await t.call(page, 'emit')).toBe('/cards/hello.png');
    });

    it('honours a custom filename', async () => {
        const t = setup({ filename: p => `card-${p.fileSlug}.png` });
        await t.fire('eleventy.before', { runMode: 'build' });
        expect(await t.call(page, 'emit')).toBe('/cards/card-hello.png');
    });

    it('XML-escapes interpolated values by default', async () => {
        const t = setup({ data: () => ({ title: 'A & B <c>', author: '', date: '' }) });
        await t.fire('eleventy.before', { runMode: 'build' });
        await t.call(page);
        expect(t.counters.svgs[0]).toContain('A &amp; B &lt;c&gt;');
    });

    it('passes raw values through when escape is false', async () => {
        const t = setup({
            escape: false,
            data: () => ({ title: 'A & B', author: '', date: '' }),
        });
        await t.fire('eleventy.before', { runMode: 'build' });
        await t.call(page);
        expect(t.counters.svgs[0]).toContain('A & B');
    });

    it('throws when data does not return an object', async () => {
        const t = setup({ data: () => 'nope' });
        await t.fire('eleventy.before', { runMode: 'build' });
        await expect(t.call(page)).rejects.toThrow(/`data` must return an object/);
    });

    it('interpolates a foreignObject HTML template (validated as XML)', async () => {
        const t = setup({
            template: path.join(FIX, 'foreign.svg'),
            data: () => ({ title: 'Wrapped title' }),
        });
        // eleventy.before validates the template as XML — foreignObject + the
        // xhtml namespace must be well-formed or this rejects.
        await t.fire('eleventy.before', { runMode: 'build' });
        await t.call(page);
        expect(t.counters.svgs[0]).toContain('<foreignObject');
        expect(t.counters.svgs[0]).toContain('Wrapped title');
    });
});

describe('multiple cards', () => {
    function multi(options) {
        const t = makeFakeConfig();
        const { factory, counters } = makeFakeBrowser();
        socialCardPlugin(t.cfg, {
            cards: {
                article: {
                    template,
                    outputDir,
                    urlPath: '/a',
                    data: () => ({ title: 'A', author: '', date: '' }),
                    delay: 0,
                },
                pages: {
                    template,
                    outputDir,
                    urlPath: '/p',
                    data: () => ({ title: 'P', author: '', date: '' }),
                    delay: 0,
                },
                ...options,
            },
            browser: factory,
        });
        return { ...t, counters };
    }

    it('renders the named variant and emits its urlPath', async () => {
        const t = multi();
        await t.fire('eleventy.before', { runMode: 'build' });
        expect(await t.call(page, 'article', 'emit')).toBe('/a/hello.png');
    });

    it('throws when called without a name and there are several', async () => {
        const t = multi();
        await t.fire('eleventy.before', { runMode: 'build' });
        await expect(t.call(page)).rejects.toThrow(/requires a card name/);
    });

    it('throws on an unknown card name', async () => {
        const t = multi();
        await t.fire('eleventy.before', { runMode: 'build' });
        await expect(t.call(page, 'nope')).rejects.toThrow(/unknown card "nope"/);
    });

    it('resolves a nameless call when there is exactly one card', async () => {
        const t = makeFakeConfig();
        const { factory } = makeFakeBrowser();
        socialCardPlugin(t.cfg, {
            cards: {
                only: {
                    template,
                    outputDir,
                    urlPath: '/o',
                    data: () => ({ title: 'x', author: '', date: '' }),
                    delay: 0,
                },
            },
            browser: factory,
        });
        await t.fire('eleventy.before', { runMode: 'build' });
        expect(await t.call(page, 'emit')).toBe('/o/hello.png');
    });
});

describe('enabled toggle', () => {
    it('enabled:false skips generation but still emits the URL', async () => {
        const t = setup({ enabled: false });
        await t.fire('eleventy.before', { runMode: 'build' });
        expect(await t.call(page, 'emit')).toBe('/cards/hello.png');
        expect(await t.call(page)).toBe('');
        expect(t.counters.launches).toBe(0);
    });

    it('predicate disables in watch, enables in build', async () => {
        const t1 = setup({ enabled: ({ runMode }) => runMode === 'build' });
        await t1.fire('eleventy.before', { runMode: 'watch' });
        await t1.call(page);
        expect(t1.counters.launches).toBe(0);

        const t2 = setup({ enabled: ({ runMode }) => runMode === 'build' });
        await t2.fire('eleventy.before', { runMode: 'build' });
        await t2.call(page);
        expect(t2.counters.launches).toBe(1);
    });
});

describe('render cache + lazy browser', () => {
    it('launches lazily and skips unchanged cards across rebuilds', async () => {
        let title = 'first';
        const t = setup({ data: () => ({ title, author: '', date: '' }) });

        await t.fire('eleventy.before', { runMode: 'build' });
        expect(t.counters.launches).toBe(0); // lazy: not launched yet

        await t.call(page); // miss -> launch + render
        expect(t.counters.launches).toBe(1);
        expect(t.counters.screenshots).toBe(1);

        await t.call(page); // same data -> cache hit
        expect(t.counters.screenshots).toBe(1);

        title = 'second';
        await t.call(page); // changed -> re-render
        expect(t.counters.screenshots).toBe(2);

        await t.fire('eleventy.after');

        await t.fire('eleventy.before', { runMode: 'watch' });
        await t.call(page); // unchanged across rebuild
        expect(t.counters.screenshots).toBe(2);
        expect(t.counters.launches).toBe(1); // no relaunch
    });

    it('re-renders when the cached PNG is missing from disk', async () => {
        const t = setup();
        await t.fire('eleventy.before', { runMode: 'build' });
        await t.call(page);
        expect(t.counters.screenshots).toBe(1);

        await fs.rm(path.join(outputDir, 'hello.png'));
        await t.call(page); // hash matches but file gone
        expect(t.counters.screenshots).toBe(2);
    });

    it('cache:false renders every time', async () => {
        const t = setup({ cache: false });
        await t.fire('eleventy.before', { runMode: 'build' });
        await t.call(page);
        await t.call(page);
        expect(t.counters.screenshots).toBe(2);
    });
});

describe('xmlEscape', () => {
    it('escapes the five XML entities', () => {
        expect(xmlEscape(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;');
    });
});

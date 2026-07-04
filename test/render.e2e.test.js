import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import socialCardPlugin from '../src/index.js';
import { makeFakeConfig } from './helpers.js';

// End-to-end: these tests launch a REAL headless Chromium (no fake browser) and
// inspect the actual PNG output. The point is to prove the one thing a real
// browser gives us over librsvg/resvg — `<foreignObject>` HTML rendering — and
// to compare real renders against each other. We deliberately do NOT compare
// against a committed baseline image: exact pixels depend on fonts, FreeType,
// anti-aliasing and the Chromium version, so a baseline would be flaky across
// machines. Comparing renders produced in the SAME run sidesteps that.

const FIX = path.join(import.meta.dirname, 'fixtures');
const foreignTemplate = path.join(FIX, 'foreign.svg');
const outputDir = path.join(import.meta.dirname, '.tmp-e2e');

// The foreignObject box from foreign.svg — where the HTML title is painted.
const TEXT_REGION = { x0: 80, y0: 120, x1: 1120, y1: 480 };

// Render a batch of cards through a single real-browser lifecycle. Each job is
// { name, title }; returns name -> decoded PNG. One browser launch for all.
async function renderBatch(template, jobs) {
    let current;
    const t = makeFakeConfig();
    socialCardPlugin(t.cfg, {
        template,
        outputDir,
        urlPath: '/c',
        delay: 150,
        data: () => ({ title: current.title }),
        filename: () => `${current.name}.png`,
    });
    await t.fire('eleventy.before', { runMode: 'build' });
    const out = {};
    try {
        for (const job of jobs) {
            current = job;
            await t.call({ fileSlug: job.name, inputPath: `./${job.name}.md` });
            const buf = await fs.readFile(path.join(outputDir, `${job.name}.png`));
            out[job.name] = PNG.sync.read(buf);
        }
    } finally {
        await t.fire('eleventy.after');
    }
    return out;
}

// Count "bright" (text) pixels in a region — the dark card background is
// #0b0b12, the title text is white, so a high red channel means painted text.
function countBrightPixels(png, { x0, y0, x1, y1 }) {
    let n = 0;
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            if (png.data[(y * png.width + x) * 4] > 128) n++;
        }
    }
    return n;
}

// Number of differing pixels between two same-size renders.
function diffPixels(a, b) {
    return pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 });
}

describe('E2E: real browser PNG output', () => {
    let renders;

    beforeAll(async () => {
        renders = await renderBatch(foreignTemplate, [
            { name: 'titled', title: 'Hello Foreign Object' },
            { name: 'blank', title: '' },
            { name: 'dup1', title: 'Deterministic Render' },
            { name: 'dup2', title: 'Deterministic Render' },
            { name: 'other', title: 'A Completely Different Title' },
        ]);
    });

    afterAll(async () => {
        await fs.rm(outputDir, { recursive: true, force: true });
    });

    it('produces a 1200x630 PNG', () => {
        expect(renders.titled.width).toBe(1200);
        expect(renders.titled.height).toBe(630);
    });

    it('renders <foreignObject> HTML text (this is why a real browser is needed)', () => {
        // With a title, the foreignObject region has painted white text.
        // librsvg/resvg would leave this region blank — that would fail here.
        const painted = countBrightPixels(renders.titled, TEXT_REGION);
        expect(painted).toBeGreaterThan(500);

        // With an empty title the same region is pure background — proving the
        // bright pixels above really came from the HTML content, not the card.
        const empty = countBrightPixels(renders.blank, TEXT_REGION);
        expect(empty).toBe(0);
    });

    it('is deterministic — same input renders identical pixels', () => {
        // This is exactly the assumption the in-memory hash cache relies on:
        // identical rendered SVG => identical PNG.
        expect(diffPixels(renders.dup1, renders.dup2)).toBe(0);
    });

    it('reflects the data — a different title changes the pixels', () => {
        expect(diffPixels(renders.titled, renders.other)).toBeGreaterThan(0);
    });
});

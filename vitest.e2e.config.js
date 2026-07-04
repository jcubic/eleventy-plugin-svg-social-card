import { defineConfig } from 'vitest/config';

// The E2E suite launches a real headless Chromium via Puppeteer, so it's kept
// separate from the fast unit suite: its own file pattern, a generous timeout
// for browser startup, and no coverage (it exercises the real render path, not
// line coverage). Run it with `npm run test:e2e`.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['test/**/*.e2e.test.js'],
        testTimeout: 60_000,
        hookTimeout: 60_000,
    },
});

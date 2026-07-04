import { defineConfig } from 'vitest/config';

// The E2E suite launches a real headless Chromium via Puppeteer, so it's kept
// separate from the fast unit suite: its own file pattern and a generous
// timeout for browser startup. Run it with `npm run test:e2e`.
//
// Coverage is opt-in (`--coverage`, via `npm run test:e2e:coverage`). Because
// the plugin runs in-process, v8 coverage here reaches the real launch/teardown
// paths the fake-browser unit suite can't. CI merges coverage/e2e with
// coverage/unit into one Coveralls report.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['test/**/*.e2e.test.js'],
        testTimeout: 60_000,
        hookTimeout: 60_000,
        coverage: {
            provider: 'v8',
            include: ['src/**/*.js'],
            reporter: ['text', 'lcov'],
            reportsDirectory: 'coverage/e2e',
        },
    },
});

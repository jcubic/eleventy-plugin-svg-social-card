import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['test/**/*.test.js'],
        // The E2E suite (real Chromium) runs separately via vitest.e2e.config.js.
        exclude: ['test/**/*.e2e.test.js', 'node_modules/**'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.js'],
            // `lcov` produces coverage/lcov.info for Coveralls; `text` prints a
            // summary in CI logs.
            reporter: ['text', 'lcov'],
        },
    },
});

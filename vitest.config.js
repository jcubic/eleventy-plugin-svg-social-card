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
            // `lcov` produces coverage/unit/lcov.info; the E2E suite writes to
            // coverage/e2e/. CI concatenates both into one report for Coveralls.
            reporter: ['text', 'lcov'],
            reportsDirectory: 'coverage/unit',
        },
    },
});

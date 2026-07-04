import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['test/**/*.test.js'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.js'],
            // `lcov` produces coverage/lcov.info for Coveralls; `text` prints a
            // summary in CI logs.
            reporter: ['text', 'lcov'],
        },
    },
});

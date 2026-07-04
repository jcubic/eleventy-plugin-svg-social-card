import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
    {
        ignores: ['node_modules/**', 'coverage/**', '**/_site/**', 'agent-*'],
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: { ...globals.node },
        },
        rules: {
            // Empty `catch {}` is used intentionally to swallow cleanup noise
            // (e.g. closing an already-dead browser target).
            'no-empty': ['error', { allowEmptyCatch: true }],
        },
    },
    // Turn off ESLint rules that conflict with Prettier's formatting.
    prettier,
];

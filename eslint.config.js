const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');
const prettier = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
    js.configs.recommended,
    prettierConfig,
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module',
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
            prettier: prettier,
        },
        rules: Object.assign(
            {},
            tseslint.configs.recommended.rules,
            {
                'prettier/prettier': 'error',
                'brace-style': ['error', 'stroustrup', { allowSingleLine: false }],
            }
        ),
    },
    {
        ignores: ['node_modules/**', 'dist/**', 'coverage/**', '*.config.js'],
    },
];


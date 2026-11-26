import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  {
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Disabled: incompatible with NestJS emitDecoratorMetadata (import type breaks DI)
      // Enable per-package in react.mjs/shared.mjs where decorators aren't used
      // '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // `as never` casts hide type mismatches at the boundary instead of fixing
      // the real shape. If you reach for one, widen/narrow the actual type.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression > TSNeverKeyword',
          message: 'Avoid `as never` casts. Type the value properly instead.',
        },
      ],
    },
  },
  // Tests rely on `as never` to keep mock repository casts terse — exempt them
  // so the rule guards production code without making fixture setup painful.
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  prettier,
)

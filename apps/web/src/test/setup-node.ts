/**
 * Setup for the `node` vitest project — the ~39 % of suites that never touch a
 * DOM (architecture guards, pure helpers, schema round-trips).
 *
 * It deliberately loads NOTHING: no jsdom, no `@testing-library/jest-dom`, no
 * i18n singleton. Measured on 2026-09-16, that trio is ~95 % of a test file's
 * wall time in this app, and a guard that reads source files off disk needs
 * none of it.
 */
export {}

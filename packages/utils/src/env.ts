// Local typing so this module compiles without `@types/node` being visible
// from every consumer of `@bellum/utils` (workspaces that don't depend on
// node types still need to type-check `env.ts` through the project graph).
// At runtime: Node provides the real `process`; Vite statically replaces
// `process.env.NODE_ENV` at build, so the browser bundle never reads it.
declare const process: { env: { NODE_ENV?: string } }

/**
 * Returns `true` when the current runtime is a development environment.
 *
 * Backed by `process.env.NODE_ENV !== 'production'`:
 *  - In Node (NestJS api, scripts), reads the live env var.
 *  - In Vite client bundles, the constant is statically replaced at build
 *    time so the function call collapses to a literal boolean post-minify
 *    — preserving dead-code elimination for dev-only branches.
 *
 * Use this as the single source of truth for "are we in dev" across web,
 * api, and shared packages.
 */
export function isDevEnvironment(): boolean {
  return process.env.NODE_ENV !== 'production'
}

/// <reference types="vite/client" />

/**
 * Build-time version ID injected by `vite.config.ts`'s `define`. Set via
 * `VITE_CODE_VERSION_ID` (computed by `tools/get-version.sh package` at deploy).
 * Falls back to `'dev'` for local builds.
 */
declare const __CODE_VERSION_ID__: string
// Défini par le build seulement quand SENTRY_AUTH_TOKEN est présent (S.2, 19/10/2026).
declare const __SENTRY_RELEASE__: string | undefined

/**
 * Reflag publishable key (feature flags). Public by design — it only allows
 * flag EVALUATION, never management. Unset = the provider is a pass-through and
 * every flag reads disabled.
 */
interface ImportMetaEnv {
  readonly VITE_REFLAG_PUBLISHABLE_KEY?: string
}

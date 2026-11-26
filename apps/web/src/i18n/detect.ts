/**
 * Initial UI-language resolution.
 *
 * Decides which language i18next loads on first paint, for a user who has never
 * touched the language switcher. The rule, in priority order:
 *
 *   1. An explicit stored choice (localStorage `bellum_lang`) ALWAYS wins — the
 *      switcher writes it, and we must never override it.
 *   2. Otherwise the browser locale decides: a francophone locale (fr, fr-FR,
 *      fr-BE, fr-CH, fr-CA, fr-LU…) → FR. Any other locale → EN (English is the
 *      international default; a de-DE / es-ES / nl-NL / en-US browser gets EN,
 *      NOT FR).
 *   3. No navigator at all (SSR / empty) → DEFAULT_LANGUAGE (FR).
 *
 * The core is a pure decision (`resolveInitialLanguage(input)`); passing no
 * argument reads the real globals (localStorage + navigator) at init.
 */
import { DEFAULT_LANGUAGE, isSupportedLanguage, LANGUAGE_STORAGE_KEY, type SupportedLanguage } from './config'

/** Read the explicit stored preference, tolerating a missing/broken localStorage. */
function readStoredLanguage(): string | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage?.getItem(LANGUAGE_STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

/** Best browser locale: `navigator.language`, falling back to `navigator.languages[0]`. */
function readNavigatorLocale(): string | null {
  if (typeof navigator === 'undefined') return null
  return navigator.language || navigator.languages?.[0] || null
}

/**
 * Resolve the language to load first.
 *
 * Pass explicit `{ stored, navigatorLocale }` for a pure, deterministic
 * decision (used by the tests); omit the argument to read the live browser
 * globals (used by the i18next init).
 */
export function resolveInitialLanguage(input?: {
  /** Raw value stored under `bellum_lang`, or null/undefined when unset. */
  stored?: string | null
  /** Browser locale (`navigator.language`), or null/undefined when unavailable. */
  navigatorLocale?: string | null
}): SupportedLanguage {
  const stored = input ? input.stored : readStoredLanguage()
  // 1. An explicit, supported stored choice wins — never overridden.
  if (isSupportedLanguage(stored)) return stored

  const navigatorLocale = input ? input.navigatorLocale : readNavigatorLocale()
  // 3. SSR / no navigator → product default (FR).
  if (!navigatorLocale) return DEFAULT_LANGUAGE
  // 2. Francophone browser → FR; anything else → EN (international default).
  return navigatorLocale.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

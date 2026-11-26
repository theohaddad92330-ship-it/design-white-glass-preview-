import { describe, expect, it } from 'vitest'
import { resolveInitialLanguage } from '@/i18n/detect'

/**
 * Pure resolver for the initial UI language. Priority:
 *   1. explicit stored choice (always wins),
 *   2. browser locale (francophone → fr, anything else → en),
 *   3. no navigator → FR fallback.
 * Every case passes explicit inputs so the decision is deterministic.
 */
describe('resolveInitialLanguage', () => {
  describe('an explicit stored choice always wins', () => {
    it("stored 'en' beats a francophone browser (fr-FR)", () => {
      expect(resolveInitialLanguage({ stored: 'en', navigatorLocale: 'fr-FR' })).toBe('en')
    })

    it("stored 'fr' beats an anglophone browser (en-US)", () => {
      expect(resolveInitialLanguage({ stored: 'fr', navigatorLocale: 'en-US' })).toBe('fr')
    })

    it('ignores an unsupported stored value and falls through to the browser locale', () => {
      expect(resolveInitialLanguage({ stored: 'de', navigatorLocale: 'en-US' })).toBe('en')
      expect(resolveInitialLanguage({ stored: '', navigatorLocale: 'fr-BE' })).toBe('fr')
    })
  })

  describe('no stored choice → browser locale decides', () => {
    it.each(['fr', 'fr-FR', 'fr-BE', 'fr-CA', 'fr-CH', 'fr-LU', 'FR-fr'])("francophone locale '%s' → fr", locale => {
      expect(resolveInitialLanguage({ stored: null, navigatorLocale: locale })).toBe('fr')
    })

    it.each(['en-US', 'en-GB', 'de-DE', 'es-ES', 'nl-NL', 'it-IT', 'pt-BR'])(
      "non-francophone locale '%s' → en (never fr)",
      locale => {
        expect(resolveInitialLanguage({ stored: null, navigatorLocale: locale })).toBe('en')
      },
    )
  })

  describe('SSR / no navigator safety', () => {
    it('no stored choice and no navigator locale → FR fallback', () => {
      expect(resolveInitialLanguage({ stored: null, navigatorLocale: null })).toBe('fr')
      expect(resolveInitialLanguage({ stored: undefined, navigatorLocale: undefined })).toBe('fr')
      expect(resolveInitialLanguage({ stored: null, navigatorLocale: '' })).toBe('fr')
    })
  })

  describe('reading the live globals (no argument)', () => {
    it('honours a stored preference set in localStorage', () => {
      window.localStorage.setItem('bellum_lang', 'en')
      try {
        expect(resolveInitialLanguage()).toBe('en')
      } finally {
        // Restore the FR pin the test setup installs (see i18n-default-language.ts).
        window.localStorage.setItem('bellum_lang', 'fr')
      }
    })
  })
})

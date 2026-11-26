import { describe, expect, it } from 'vitest'
import {
  REPLY_PREFERENCE_KEYS,
  REPLY_PREFERENCE_OPTIONS,
  isReplyPreferenceKey,
  readReplyPreferences,
  userPreferencesPatchSchema,
} from './reply-preferences.js'

/**
 * #1928.2/.3/.5/.6 — les quatre réglages de réponse, vus du contrat.
 *
 * Deux promesses : une valeur inconnue n'est jamais DEVINÉE à la lecture, et
 * jamais STOCKÉE à l'écriture. Entre les deux, le sac reste libre pour les
 * clés qui y vivaient déjà.
 */
describe('reply-preferences — le contrat des réglages de réponse', () => {
  it('nomme exactement quatre réglages, dans l’ordre d’affichage', () => {
    expect(REPLY_PREFERENCE_KEYS).toEqual(['replyLength', 'replyTone', 'replyFormat', 'replySources'])
    expect(Object.keys(REPLY_PREFERENCE_OPTIONS).sort()).toEqual([...REPLY_PREFERENCE_KEYS].sort())
  })

  it('ne propose pas « tableaux » tant que le rendu du chat ne sait pas les afficher', () => {
    expect(REPLY_PREFERENCE_OPTIONS.replyFormat).toEqual(['text', 'lists'])
  })

  it('lit les valeurs connues et IGNORE le reste — jamais une valeur devinée', () => {
    expect(
      readReplyPreferences({
        replyLength: 'short',
        replyTone: 'banana',
        replyFormat: 42,
        replySources: 'detailed',
        tone: 'direct',
      }),
    ).toEqual({ replyLength: 'short', replySources: 'detailed' })
    expect(readReplyPreferences(null)).toEqual({})
    expect(readReplyPreferences(undefined)).toEqual({})
  })

  it('reconnaît une clé de réponse, et pas une clé libre voisine', () => {
    expect(isReplyPreferenceKey('replyTone')).toBe(true)
    expect(isReplyPreferenceKey('tone')).toBe(false)
  })

  describe('le sac du PATCH', () => {
    it('laisse passer les clés libres telles quelles', () => {
      const bag = { tone: 'direct', sectors: ['Banque'], nested: { a: 1 } }
      expect(userPreferencesPatchSchema.parse(bag)).toEqual(bag)
    })

    it('accepte une valeur connue', () => {
      expect(userPreferencesPatchSchema.safeParse({ replyLength: 'detailed' }).success).toBe(true)
    })

    it('REFUSE une valeur inconnue au lieu de la stocker pour rien', () => {
      for (const bad of [
        { replyLength: 'banana' },
        { replyTone: null },
        { replyFormat: 'tables' },
        { replySources: 1 },
      ]) {
        const result = userPreferencesPatchSchema.safeParse(bad)
        expect(result.success).toBe(false)
      }
    })

    it('nomme la clé fautive dans l’erreur', () => {
      const result = userPreferencesPatchSchema.safeParse({ tone: 'ok', replyTone: 'loud' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.path).toEqual(['replyTone'])
    })
  })
})

import { describe, expect, it } from 'vitest'
import { isValidAgendaPreferences, readAgendaPreferences } from './agenda-preferences.js'
import { userPreferencesPatchSchema } from './reply-preferences.js'

/**
 * #2101.17 — les préférences d'agenda, au-delà du seul temps protégé.
 *
 * Même promesse que `protected-time.test.ts` : une valeur inconnue ou hors
 * bornes n'est jamais DEVINÉE à la lecture, et jamais STOCKÉE à l'écriture.
 */
describe('agenda-preferences — le contrat des préférences d’agenda', () => {
  it('accepte une paire valide', () => {
    expect(isValidAgendaPreferences({ dossierDurationMinutes: 30, reserveSlots: 2 })).toBe(true)
  })

  it('refuse une durée hors bornes', () => {
    expect(isValidAgendaPreferences({ dossierDurationMinutes: 5, reserveSlots: 1 })).toBe(false)
    expect(isValidAgendaPreferences({ dossierDurationMinutes: 241, reserveSlots: 1 })).toBe(false)
  })

  it('refuse une réserve négative ou non entière', () => {
    expect(isValidAgendaPreferences({ dossierDurationMinutes: 45, reserveSlots: -1 })).toBe(false)
    expect(isValidAgendaPreferences({ dossierDurationMinutes: 45, reserveSlots: 1.5 })).toBe(false)
  })

  it('refuse une forme qui n’est pas un objet, ou un champ manquant', () => {
    expect(isValidAgendaPreferences(null)).toBe(false)
    expect(isValidAgendaPreferences('45 minutes')).toBe(false)
    expect(isValidAgendaPreferences({ dossierDurationMinutes: 45 })).toBe(false)
  })

  it('lit chaque champ INDÉPENDAMMENT — un champ invalide n’efface pas l’autre', () => {
    expect(readAgendaPreferences({ agendaPreferences: { dossierDurationMinutes: 30, reserveSlots: 2 } })).toEqual({
      dossierDurationMinutes: 30,
      reserveSlots: 2,
    })
    expect(readAgendaPreferences({ agendaPreferences: { dossierDurationMinutes: 'trente', reserveSlots: 2 } })).toEqual(
      {
        reserveSlots: 2,
      },
    )
    expect(readAgendaPreferences(null)).toEqual({})
    expect(readAgendaPreferences({})).toEqual({})
    expect(readAgendaPreferences({ agendaPreferences: 'trente minutes' })).toEqual({})
  })

  describe('le sac du PATCH', () => {
    it('accepte une paire valide', () => {
      expect(
        userPreferencesPatchSchema.safeParse({ agendaPreferences: { dossierDurationMinutes: 30, reserveSlots: 2 } })
          .success,
      ).toBe(true)
    })

    it('REFUSE une forme invalide au lieu de la stocker pour rien', () => {
      const result = userPreferencesPatchSchema.safeParse({
        agendaPreferences: { dossierDurationMinutes: 5, reserveSlots: 2 },
      })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.path).toEqual(['agendaPreferences'])
    })
  })
})

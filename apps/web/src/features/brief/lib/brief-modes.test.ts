import { describe, expect, it } from 'vitest'
import { BRIEF_MODES, DEFAULT_BRIEF_MODE, isBriefMode } from './brief-modes'

// #2125.29-.33 — le brief propose cinq modes ; cette liste est ce que
// `AccountBrief.tsx` boucle pour construire le sélecteur ET ce que
// `brief.json` doit nommer des deux côtés (FR/EN).
describe('BRIEF_MODES', () => {
  it('porte exactement les cinq modes attendus, dans cet ordre', () => {
    expect(BRIEF_MODES).toEqual(['first_meeting', 'client_checkin', 'partner', 'renewal', 'defense'])
  })

  it('le mode par défaut est le premier rendez-vous', () => {
    expect(DEFAULT_BRIEF_MODE).toBe('first_meeting')
    expect(BRIEF_MODES).toContain(DEFAULT_BRIEF_MODE)
  })

  it('isBriefMode distingue un mode connu d’une valeur quelconque', () => {
    expect(isBriefMode('partner')).toBe(true)
    expect(isBriefMode('defense')).toBe(true)
    expect(isBriefMode('inconnu')).toBe(false)
    expect(isBriefMode('')).toBe(false)
  })
})

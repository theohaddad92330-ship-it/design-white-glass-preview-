import { describe, expect, it } from 'vitest'
import type { TalentSearchQuery } from '@bellum/contracts'
import { savedRecordToTalentFilters, talentFiltersToSavedRecord } from './talent-saved-view-filters'

/**
 * #2152.37 — LES VUES ENREGISTRÉES DU VIVIER.
 *
 * `SAVED_VIEW_SCOPES` porte déjà `'talents'` (`governance.ts`) et le serveur
 * (`GET/POST/DELETE /governance/views`) est déjà générique par `scope` —
 * aucun appelant web ne l'utilisait pour le vivier : le motif exact que
 * CLAUDE.md nomme « du code juste, calculé, testé, que personne n'appelle ».
 *
 * Même contrat que `saved-view-filters.ts` (besoins) : on enregistre le
 * CRITÈRE, jamais la page ni la limite — une vue relue ne doit jamais
 * composer une requête qu'un serveur strict refuserait.
 */
describe('talentFiltersToSavedRecord', () => {
  it('rend {} quand rien n’est filtré — le serveur refuse une vue sans critère', () => {
    expect(talentFiltersToSavedRecord({})).toEqual({})
  })

  it('garde le texte libre et les compétences, jamais la pagination', () => {
    const record = talentFiltersToSavedRecord({ q: 'kubernetes', skills: ['Java'], page: 3, limit: 25 })
    expect(record).toEqual({ q: 'kubernetes', skills: ['Java'] })
  })

  it('garde une énumération connue (disponibilité)', () => {
    expect(talentFiltersToSavedRecord({ availability: 'immediate' })).toEqual({ availability: 'immediate' })
  })
})

describe('savedRecordToTalentFilters', () => {
  it('relit un enregistrement valide tel quel, sans pagination', () => {
    const filters = savedRecordToTalentFilters({ q: 'kubernetes', skills: ['Java'], availability: 'immediate' })
    expect(filters).toEqual({ q: 'kubernetes', skills: ['Java'], availability: 'immediate' })
    expect(filters).not.toHaveProperty('page')
    expect(filters).not.toHaveProperty('limit')
  })

  it('un enregistrement illisible (forme abîmée) relit un filtre VIDE, jamais une erreur', () => {
    expect(savedRecordToTalentFilters(null)).toEqual({})
    expect(savedRecordToTalentFilters('texte')).toEqual({})
    expect(savedRecordToTalentFilters({ availability: 'valeur-disparue-du-contrat' })).toEqual({})
  })

  it('une vue sans compétence ne RESSORT pas avec `skills: []` (zod 4 garde les défauts sous `.partial()`)', () => {
    const filters = savedRecordToTalentFilters({ q: 'java', availability: 'immediate' })
    expect(filters).toEqual({ q: 'java', availability: 'immediate' })
    expect(filters).not.toHaveProperty('skills')
  })

  it('aller-retour : ce qu’on enregistre se relit à l’identique', () => {
    const original: Partial<TalentSearchQuery> = {
      q: 'devops',
      seniority: 'senior',
      minTjm: 400,
      maxTjm: 900,
      derived: 'available',
    }
    const record = talentFiltersToSavedRecord(original)
    expect(savedRecordToTalentFilters(record)).toEqual(original)
  })
})

import { describe, expect, it } from 'vitest'
import { TALENT_VIEWS, talentViewFilters } from './talent.js'

/**
 * Les vues par défaut du vivier (PDF 3 §6.4).
 *
 * Ce que ces tests protègent : une vue qui filtre sur le DÉCLARATIF
 * reproduirait le défaut que tout le §6 corrige — on retrouverait
 * « disponibles » des gens en mission.
 */
describe('talentViewFilters', () => {
  const TODAY = new Date('2026-08-20T10:00:00.000Z')

  it('couvre les sept vues, sans trou', () => {
    for (const view of TALENT_VIEWS) {
      expect(Object.keys(talentViewFilters(view, TODAY)).length).toBeGreaterThan(0)
    }
  })

  it('« disponibles sous 30 jours » inclut ceux qui le sont DÉJÀ', () => {
    // Les exclure est l'erreur classique : ce sont les premiers à placer.
    expect(talentViewFilters('available_30d', TODAY)).toEqual({ freeBefore: '2026-09-19' })
  })

  it('« en intercontrat » et « à revalider » lisent la disponibilité DÉRIVÉE', () => {
    expect(talentViewFilters('on_bench', TODAY)).toEqual({ derived: 'available' })
    // `unknown` = la fiche dit quelque chose, aucune affectation ne le confirme.
    // C'est la ligne dont il faut appeler la personne.
    expect(talentViewFilters('to_revalidate', TODAY)).toEqual({ derived: 'unknown' })
  })

  it('ne mélange jamais dormance et disponibilité', () => {
    // Quelqu'un peut être disponible ET dormant, ou occupé ET dormant : ce sont
    // deux axes, et les confondre ferait relancer les mauvaises personnes.
    expect(talentViewFilters('dormant', TODAY)).toEqual({ dormantMonths: 6 })
  })

  it('#2182.23 — « sans mission récente » ne se replie PAS sur « dormant » (contact)', () => {
    // Ne pas avoir parlé à quelqu'un et ne pas l'avoir placé sont deux faits
    // différents (registre du 16/09/2026, #2182.23).
    expect(talentViewFilters('no_recent_mission', TODAY)).toEqual({ noMissionMonths: 6 })
  })

  it('la vue candidats ne filtre QUE sur la nature', () => {
    expect(talentViewFilters('candidates', TODAY)).toEqual({ kind: 'candidate' })
  })
})

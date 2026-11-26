import { describe, expect, it } from 'vitest'
import { needDetailFamilyOf, NEED_DETAIL_FAMILIES } from './need-detail-tabs'

/**
 * #2175.1-.6, .41 — RÉDUIRE LES SIX ONGLETS À QUATRE FAMILLES, SANS PERDRE
 * LES CINQ DEEP LINKS HISTORIQUES.
 *
 * `needDetailFamilyOf` est la SEULE dérivation entre un `?tab=` (ancien nom
 * ou nouveau) et la famille visible (GA-26) : `NeedDetailPage.tsx` la lit,
 * personne ne la recopie.
 */
describe('needDetailFamilyOf', () => {
  it('les quatre familles sont exactement Synthèse / Profils & positionnements / Avancement / Documents & historique', () => {
    expect(NEED_DETAIL_FAMILIES).toEqual(['synthese', 'profiles', 'progress', 'documents'])
  })

  it('sans paramètre (lien entrant nu), ouvre Synthèse — le comportement d’avant ce lot', () => {
    expect(needDetailFamilyOf(undefined)).toBe('synthese')
  })

  it('l’ancien nom « overview » ouvre Synthèse', () => {
    expect(needDetailFamilyOf('overview')).toBe('synthese')
  })

  it('#2175.2 — l’ancien deep link « matching » ouvre Profils & positionnements', () => {
    expect(needDetailFamilyOf('matching')).toBe('profiles')
  })

  it('#2175.3 — l’ancien deep link « positioning » ouvre Profils & positionnements', () => {
    expect(needDetailFamilyOf('positioning')).toBe('profiles')
  })

  it('#2175.4 — l’ancien deep link « activity » ouvre Avancement', () => {
    expect(needDetailFamilyOf('activity')).toBe('progress')
  })

  it('#2175.5 — l’ancien deep link « documents » ouvre Documents & historique', () => {
    expect(needDetailFamilyOf('documents')).toBe('documents')
  })

  it('#2175.6 / refonte Théo — l’ancien deep link « history » ouvre Avancement, où vit l’historique', () => {
    expect(needDetailFamilyOf('history')).toBe('progress')
  })

  it('les nouveaux noms de famille se résolvent en eux-mêmes', () => {
    expect(needDetailFamilyOf('synthese')).toBe('synthese')
    expect(needDetailFamilyOf('profiles')).toBe('profiles')
    expect(needDetailFamilyOf('progress')).toBe('progress')
    expect(needDetailFamilyOf('documents')).toBe('documents')
  })
})

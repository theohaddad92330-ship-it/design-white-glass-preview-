import { describe, expect, it } from 'vitest'
import { getRecommendation } from './types'

/**
 * #3818 — la LISTE des comptes (`/accounts`) disait « ÉCARTER POUR CET OBJECTIF » sur chaque
 * score < 5 même quand l'espace n'avait renseigné AUCUN objectif : seules les quatre fiches
 * compte lisaient l'objectif. La liste lit désormais le même réglage (`hasOfferObjective`) et
 * tait l'écartement quand il n'y a pas d'objectif à juger.
 */
describe('getRecommendation — libellé de la liste selon l’objectif (#3818)', () => {
  it('avec un objectif renseigné (défaut) : un score bas reste « ÉCARTER POUR CET OBJECTIF »', () => {
    expect(getRecommendation(3).label).toBe('ÉCARTER POUR CET OBJECTIF')
    expect(getRecommendation(3, { hasObjective: true }).label).toBe('ÉCARTER POUR CET OBJECTIF')
  })

  it('SANS objectif : jamais « ÉCARTER POUR CET OBJECTIF » — l’évaluation personnalisée manque', () => {
    const label = getRecommendation(3, { hasObjective: false }).label
    expect(label).not.toBe('ÉCARTER POUR CET OBJECTIF')
    expect(label).toBe('ÉVALUATION PERSONNALISÉE INDISPONIBLE — ZÉRO MESURÉ')
  })

  it('sans objectif, un score non-STOP garde son nom (la règle ne touche que l’écartement)', () => {
    expect(getRecommendation(8, { hasObjective: false }).label).toBe('AGIR MAINTENANT')
  })

  it('score inconnu : tiret, jamais un verdict', () => {
    expect(getRecommendation(null, { hasObjective: false }).label).toBe('—')
  })

  // KEVIN-FIX — le libellé long (389 px, nowrap) débordait sur la colonne voisine et disait « ZÉRO MESURÉ » :
  // un non mesuré n'est jamais « 0 ». La liste porte donc la RAISON à part ; le texte court est dans les locales.
  it('sans objectif : la raison est dite à part, jamais « zéro »', () => {
    expect(getRecommendation(3, { hasObjective: false }).unavailableReason).toBe('no_objective')
    expect(getRecommendation(3, { hasObjective: true }).unavailableReason).toBeNull()
    expect(getRecommendation(8, { hasObjective: false }).unavailableReason).toBeNull()
  })
})

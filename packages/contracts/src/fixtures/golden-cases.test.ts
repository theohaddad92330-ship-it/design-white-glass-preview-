import { describe, expect, it } from 'vitest'
import { GOLDEN_CASES, goldenCase } from './golden-cases.js'

/**
 * Les cinq cas de référence — LEGACY-006.
 *
 * ⚠️ Ces tests vérifient la FORME du corpus, pas le comportement du produit :
 * les affirmations se confrontent au code par une personne, pas par une
 * assertion. Prétendre le contraire ferait passer « le corpus est bien écrit »
 * pour « le produit fait ce qu'il dit ».
 */
describe('le corpus de cas de référence', () => {
  it('porte les cinq cas, chacun avec au moins trois affirmations', () => {
    expect(GOLDEN_CASES).toHaveLength(5)
    for (const entry of GOLDEN_CASES) {
      expect(entry.id.trim().length).toBeGreaterThan(0)
      expect(entry.derivedFrom.trim().length).toBeGreaterThan(0)
      expect(entry.assertions.length).toBeGreaterThanOrEqual(3)
      for (const assertion of entry.assertions) expect(assertion.trim().length).toBeGreaterThan(10)
    }
  })

  it('les identifiants sont uniques', () => {
    expect(new Set(GOLDEN_CASES.map(entry => entry.id)).size).toBe(GOLDEN_CASES.length)
  })

  it('AUCUN cas ne nomme une société ou une personne réelle', () => {
    // La condition posée par le paquet source : `rawClientDataIncluded: false`.
    // Le dépôt venait de la violer dans ses propres fixtures de contrat.
    const corpus = JSON.stringify(GOLDEN_CASES).toLowerCase()
    for (const forbidden of ['société générale', 'societe generale', 'skaizen', 'bellum-it', 'capgemini']) {
      expect(corpus).not.toContain(forbidden)
    }
  })

  it('porte l’affirmation qui les résume toutes', () => {
    // C'est l'interdit du paquet, et le premier à vérifier quand un classement
    // de contacts surprend.
    const all = GOLDEN_CASES.flatMap(entry => entry.assertions)
    expect(all.some(assertion => assertion.includes('le titre seul ne peut pas établir une priorité'))).toBe(true)
  })

  it('se retrouve par identifiant, et rend `null` sur un inconnu', () => {
    expect(goldenCase('mission_revenue_protection')?.assertions.length).toBe(3)
    expect(goldenCase('inexistant')).toBeNull()
  })
})

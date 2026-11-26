import { describe, expect, it } from 'vitest'
import { CONTACT_REJECTION_REASONS, CONTACT_UNMEASURED_REJECTION_REASONS } from './contact.js'

/**
 * #2934 (#2309.11/.12/.17) — trois raisons d'exclusion NOMMÉES par l'épopée
 * qu'aucun détecteur ne mesure aujourd'hui (mauvaise entreprise, mauvaise
 * entité, information trop ancienne). Distinctes de `CONTACT_REJECTION_REASONS`
 * (mesurées, comptées, jamais à 0 dans la LISTE) : une raison non mesurable
 * n'est pas « 0 contact concerné », c'est « on ne sait pas la compter » — GA-18/19,
 * la même règle qu'un axe de score non évaluable, appliquée ici à une raison.
 */
describe('CONTACT_UNMEASURED_REJECTION_REASONS (#2934, #2309.11/.12/.17)', () => {
  it('nomme exactement les trois raisons sans détecteur', () => {
    expect([...CONTACT_UNMEASURED_REJECTION_REASONS].sort()).toEqual(
      ['wrong_company', 'wrong_entity', 'stale_information'].sort(),
    )
  })

  it('ne recoupe jamais les raisons déjà MESURÉES — sinon une raison compterait deux fois', () => {
    const measured = new Set<string>(CONTACT_REJECTION_REASONS)
    for (const reason of CONTACT_UNMEASURED_REJECTION_REASONS) {
      expect(measured.has(reason)).toBe(false)
    }
  })
})

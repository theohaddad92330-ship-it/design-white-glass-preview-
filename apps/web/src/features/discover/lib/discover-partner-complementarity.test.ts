import { describe, expect, it } from 'vitest'
import {
  computePartnerComplementarity,
  isComplementarityUnknown,
  MINIMUM_COMPLEMENTARITY_AXES,
  PARTNER_COMPLEMENTARITY_AXES,
  passesComplementarityKnown,
} from './discover-partner-complementarity'

/**
 * #2151.36 / #2165.55 / #2166.39 — « complémentarité » n'avait aucune
 * définition dans le dépôt (registre 15/09). DÉCISION Louis 15/09 : un score
 * DÉCOMPOSÉ à axes nommés (recouvrement d'expertises · de secteurs · de
 * comptes · taille) — jamais un score nu, et sous 3 axes évalués il n'y a pas
 * de score (doctrine `ScoreWithAxes`, même seuil que `commercial-audit-context`).
 *
 * ⚠️ Deux axes (expertise, comptes) n'ont AUCUNE source câblée ici : ils
 * restent NOMMÉS mais `score: null` tant que la mémoire marché n'est pas
 * branchée à ce calcul (hors périmètre de ce lot). C'est le cas honnête —
 * jamais un score inventé pour remplir la case.
 */
describe('computePartnerComplementarity', () => {
  it('nomme les quatre axes, toujours dans le même ordre', () => {
    const result = computePartnerComplementarity(
      { sector: null, nafCode: null, headcountRange: null },
      { sectors: [], headcountRange: null },
    )
    expect(result.axes.map(a => a.axis)).toEqual([...PARTNER_COMPLEMENTARITY_AXES])
  })

  it('mesure le recouvrement de secteurs par préfixe NAF', () => {
    const result = computePartnerComplementarity(
      { sector: null, nafCode: '62.02A', headcountRange: null },
      { sectors: ['software_tech'], headcountRange: null },
    )
    const sectorsAxis = result.axes.find(a => a.axis === 'sectors')
    expect(sectorsAxis?.score).toBe(100)
  })

  it('note « non mesuré » un recouvrement de secteurs sans profil déclaré', () => {
    const result = computePartnerComplementarity(
      { sector: null, nafCode: '62.02A', headcountRange: null },
      { sectors: [], headcountRange: null },
    )
    expect(result.axes.find(a => a.axis === 'sectors')?.score).toBeNull()
  })

  it('mesure la taille — même tranche = recouvrement complet', () => {
    const result = computePartnerComplementarity(
      { sector: null, nafCode: null, headcountRange: '100 à 199 salariés' },
      { sectors: [], headcountRange: '100 à 199 salariés' },
    )
    expect(result.axes.find(a => a.axis === 'size')?.score).toBe(100)
  })

  it('les axes expertise et comptes restent NOMMÉS mais non évalués — aucune source câblée', () => {
    const result = computePartnerComplementarity(
      { sector: null, nafCode: '62.02A', headcountRange: '100 à 199 salariés' },
      { sectors: ['software_tech'], headcountRange: '100 à 199 salariés' },
    )
    expect(result.axes.find(a => a.axis === 'expertise')?.score).toBeNull()
    expect(result.axes.find(a => a.axis === 'accounts')?.score).toBeNull()
    expect(result.unmeasuredAxes).toEqual(['expertise', 'accounts'])
  })

  it(`sous ${MINIMUM_COMPLEMENTARITY_AXES} axes évalués, le score composite reste null — jamais un score nu`, () => {
    const result = computePartnerComplementarity(
      { sector: null, nafCode: '62.02A', headcountRange: '100 à 199 salariés' },
      { sectors: ['software_tech'], headcountRange: '100 à 199 salariés' },
    )
    // seuls sectors + size sont mesurables ici (2 < MINIMUM_COMPLEMENTARITY_AXES)
    expect(result.score).toBeNull()
  })
})

/**
 * #2165.55 — DÉCISION Louis 19/09 : « connue » ne veut PAS dire « score
 * composite rendu » — sous {@link MINIMUM_COMPLEMENTARITY_AXES} axes celui-ci
 * reste structurellement `null` (voir le test juste au-dessus). « Connue »
 * veut dire : au moins UN axe a pu être évalué. Zéro axe évalué = totalement
 * inconnue, et c'est la seule fois où la carte le dit — jamais un bloc vide,
 * jamais un score à 0.
 */
describe('passesComplementarityKnown / isComplementarityUnknown (#2165.55)', () => {
  it('décoché, rien ne change', () => {
    const result = computePartnerComplementarity(
      { sector: null, nafCode: null, headcountRange: null },
      { sectors: [], headcountRange: null },
    )
    expect(passesComplementarityKnown(result, false)).toBe(true)
  })

  it('coché, écarte une complémentarité totalement inconnue (aucun axe évalué)', () => {
    const result = computePartnerComplementarity(
      { sector: null, nafCode: null, headcountRange: null },
      { sectors: [], headcountRange: null },
    )
    expect(passesComplementarityKnown(result, true)).toBe(false)
    expect(isComplementarityUnknown(result)).toBe(true)
  })

  it('coché, garde une complémentarité dont AU MOINS un axe est évalué — même sans score composite', () => {
    const result = computePartnerComplementarity(
      { sector: null, nafCode: '62.02A', headcountRange: null },
      { sectors: ['software_tech'], headcountRange: null },
    )
    expect(result.score).toBeNull() // 1 seul axe évalué, sous le seuil composite
    expect(passesComplementarityKnown(result, true)).toBe(true)
    expect(isComplementarityUnknown(result)).toBe(false)
  })

  it('`null` (jamais calculée, ex. mode compte) compte comme inconnue', () => {
    expect(passesComplementarityKnown(null, true)).toBe(false)
    expect(isComplementarityUnknown(null)).toBe(true)
  })
})

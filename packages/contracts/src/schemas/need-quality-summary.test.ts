import { describe, expect, it } from 'vitest'
import { needQualitySummary } from './need-quality-summary.js'

/**
 * #2323.46 — le résumé qualité (« matchable mais pas présentable, il manque
 * X »), DÉRIVÉ des trois portes déjà écrites (`needMatcherGate`,
 * `needPresenterGate`, `needHasEngagedConsultant`) — jamais une quatrième
 * lecture des champs du besoin. Dépendant par construction : ce fichier ne
 * recalcule rien, il COMPOSE ce que les trois gates ont déjà dit (GA-26).
 *
 * ⚠️ Aucune PROBABILITÉ, aucun score nu — trois booléens et ce qui manque,
 * NOMMÉ à chaque niveau (doctrine « un score n'est jamais nu »).
 */
const readyMatcher = { canLaunch: true, missingAdvisory: [] }
const readyPresenter = { missingAdvisory: [], profileTypeDisagreement: false }

describe('needQualitySummary', () => {
  it('ni matchable ni présentable ni prêt à engager quand rien n’est fait', () => {
    const summary = needQualitySummary({
      matcher: { canLaunch: false, missingAdvisory: ['seniority', 'timing'] },
      presenter: { missingAdvisory: ['recipient', 'budget'], profileTypeDisagreement: false },
      hasEngagedConsultant: false,
    })
    expect(summary.matchable).toBe(false)
    expect(summary.presentable).toBe(false)
    expect(summary.readyToEngage).toBe(false)
    expect(summary.missingMatcher).toEqual(['seniority', 'timing'])
    expect(summary.missingPresenter).toEqual(['recipient', 'budget'])
  })

  it('matchable mais pas présentable quand la porte MATCHER est franchie mais pas PRÉSENTER', () => {
    const summary = needQualitySummary({
      matcher: readyMatcher,
      presenter: { missingAdvisory: ['process'], profileTypeDisagreement: false },
      hasEngagedConsultant: false,
    })
    expect(summary.matchable).toBe(true)
    expect(summary.presentable).toBe(false)
    expect(summary.missingPresenter).toEqual(['process'])
  })

  it('un désaccord de type de profil rend le besoin non présentable, même sans critère manquant', () => {
    const summary = needQualitySummary({
      matcher: readyMatcher,
      presenter: { missingAdvisory: [], profileTypeDisagreement: true },
      hasEngagedConsultant: false,
    })
    expect(summary.presentable).toBe(false)
    expect(summary.profileTypeDisagreement).toBe(true)
  })

  it('présentable quand les cinq critères PRÉSENTER sont réunis et aucun désaccord', () => {
    const summary = needQualitySummary({
      matcher: readyMatcher,
      presenter: readyPresenter,
      hasEngagedConsultant: false,
    })
    expect(summary.matchable).toBe(true)
    expect(summary.presentable).toBe(true)
    expect(summary.readyToEngage).toBe(false)
  })

  it('prêt à engager seulement quand un consultant est engagé, indépendamment du reste', () => {
    const summary = needQualitySummary({
      matcher: readyMatcher,
      presenter: readyPresenter,
      hasEngagedConsultant: true,
    })
    expect(summary.readyToEngage).toBe(true)
  })

  it('les trois axes sont indépendants — un consultant déjà engagé reste vrai même si le besoin a régressé sur un autre axe depuis, jamais une suppression inventée', () => {
    const summary = needQualitySummary({
      matcher: { canLaunch: false, missingAdvisory: [] },
      presenter: readyPresenter,
      hasEngagedConsultant: true,
    })
    expect(summary.matchable).toBe(false)
    expect(summary.readyToEngage).toBe(true)
  })
})

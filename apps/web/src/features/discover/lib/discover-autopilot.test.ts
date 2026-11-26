import { describe, expect, it } from 'vitest'
import type { IdealAccountProfile } from '@bellum/contracts'
import { autopilotPlan, AUTOPILOT_WINDOW_DAYS } from './discover-autopilot'
import { buildDiscoverRequest } from './discover-filters'
import { buildRegistryQuery, buildSignalsQuery } from './discover-query'
import { registryPart, signalsPart } from './discover-filters'

function icp(overrides: Partial<IdealAccountProfile> = {}): IdealAccountProfile {
  return {
    size: 'pme',
    sectorsPriority: ['Banque de détail'],
    decisionLevel: 'director',
    entryStrategy: 'topDown',
    ...overrides,
  }
}

describe('autopilotPlan — « lancer sans idée de départ »', () => {
  it('traduit le profil ESN en filtres du rail RÉELS, exécutables tels quels', () => {
    const plan = autopilotPlan(icp())
    // Aucun signal coché → la recherche part du registre (la cible structurée).
    expect(buildDiscoverRequest(plan.filters)?.mode).toBe('registry')
    expect(plan.filters.sectors).toEqual(['retail_banking'])
    // #4516.6 — l'autopilote ne pose AUCUNE taille (revient sur la taille du profil appliquée).
    expect(plan.filters.headcount).toEqual([])
    const filters = buildRegistryQuery(registryPart(plan.filters)).filters
    expect(filters).toMatchObject({ nafCode: '64.19Z,64.92Z,66.19A,66.19B' })
    expect(filters).not.toHaveProperty('headcountMin')
  })

  it('rend chaque critère AVEC sa provenance — sinon le bouton est une boîte noire', () => {
    const plan = autopilotPlan(icp())
    expect(plan.criteria).toEqual([
      { key: 'sector', valueKeys: ['sector:retail_banking'], originKey: 'profileSectors' },
      // Recette 21/10 U.1 — le niveau de décision du profil (« director ») est posé et argumenté.
      { key: 'decisionLevel', valueKeys: ['filters.decisionLevelValue.n1'], originKey: 'profileInterlocutors' },
    ])
    expect(plan.basisKey).toBe('profile')
  })

  it('croise TOUS les secteurs reconnus du profil, pas seulement le premier', () => {
    const plan = autopilotPlan(icp({ sectorsPriority: ['Banque', 'Industrie'] }))
    // « Banque » et « Industrie » sont des mots LARGES : aucun libellé fin ne
    // les contient, ils rendent donc leur GROUPE entier. C'est la lecture
    // honnête de « je cible la banque et l'industrie ».
    expect(plan.filters.sectors).toContain('retail_banking')
    expect(plan.filters.sectors).toContain('insurance')
    expect(plan.filters.sectors).toContain('automotive')
    expect(plan.filters.sectors).toContain('aerospace')
    expect(plan.criteria[0]?.key).toBe('sector')
    expect(plan.criteria[0]?.valueKeys).toContain('sector:aerospace')
  })

  it('n’invente pas de secteur quand le profil est en texte libre non reconnu', () => {
    const plan = autopilotPlan(icp({ sectorsPriority: ['Viticulture bio'] }))
    // #4516.6 — ni secteur inventé, ni taille posée : sans cible structurée, le plan part des signaux datés.
    expect(buildDiscoverRequest(plan.filters)?.mode).toBe('signals')
    expect(plan.filters.sectors).toEqual([])
    expect(plan.filters.headcount).toEqual([])
    expect(plan.criteria.map(c => c.key)).not.toContain('headcount')
  })

  it('repart du marché — et le dit — quand le profil ne donne aucun critère', () => {
    const plan = autopilotPlan(icp({ sectorsPriority: [], size: 'all' }))
    expect(buildDiscoverRequest(plan.filters)?.mode).toBe('signals')
    expect(plan.basisKey).toBe('profileThin')
    expect(plan.filters.sinceDays).toBe(AUTOPILOT_WINDOW_DAYS)
    expect(buildSignalsQuery(signalsPart(plan.filters)).sources).toEqual(['tender', 'award', 'hiring'])
  })

  it('sans profil du tout, part des signaux datés plutôt que d’une cible supposée', () => {
    const plan = autopilotPlan(undefined)
    expect(buildDiscoverRequest(plan.filters)?.mode).toBe('signals')
    expect(plan.basisKey).toBe('noProfile')
    expect(plan.criteria.map(c => c.key)).toEqual(['window', 'sources'])
  })

  it('ne renvoie JAMAIS un plan sans critère affichable', () => {
    const cases = [undefined, null, icp(), icp({ size: 'all' }), icp({ sectorsPriority: [], size: 'grandCompte' })]
    for (const value of cases) expect(autopilotPlan(value).criteria.length).toBeGreaterThan(0)
  })
})

describe('autopilotPlan — #3528 : « ramène plein d’autres critères »', () => {
  it('pose les zones de chasse DÉCLARÉES au portefeuille d’offre avec la cible de profil', () => {
    const plan = autopilotPlan(icp(), ['11', '84'])
    expect(plan.basisKey).toBe('profile')
    expect(plan.filters.region).toEqual(['11', '84'])
    expect(plan.filters.sectors).toEqual(['retail_banking'])
  })

  it('⚠️ SAIT DIRE NON — aucune zone déclarée : aucune contrainte de territoire inventée', () => {
    expect(autopilotPlan(icp()).filters.region).toEqual([])
    expect(autopilotPlan(icp(), []).filters.region).toEqual([])
  })

  it('le repli marché (profil vide) ne pose pas de zone', () => {
    expect(autopilotPlan(null, ['11']).filters.region).toEqual([])
  })
})

// LUDB.2 — « Ta cible » = SON profil : les secteurs déclarés au portefeuille
// d'offre (Réglages › Profil) passent avant les libellés du contexte généré.
describe('autopilotPlan — LUDB.2 secteurs du portefeuille d’offre', () => {
  it('profil industriel AURA : les secteurs ET la zone du profil, pas les défauts IT', () => {
    const plan = autopilotPlan(
      icp({ sectorsPriority: ['Fintech', 'Éditeurs & tech', 'Luxe'] }),
      ['84'],
      ['aerospace', 'automotive'],
    )
    expect(plan.filters.sectors).toEqual(['aerospace', 'automotive'])
    expect(plan.filters.region).toEqual(['84'])
    expect(plan.basisKey).toBe('profile')
  })

  it('SAIT DIRE NON : sans secteur d’offre déclaré, le plan IT reste byte-identique', () => {
    const withoutOffer = autopilotPlan(icp(), ['84'])
    expect(autopilotPlan(icp(), ['84'], [])).toEqual(withoutOffer)
    expect(withoutOffer.filters.sectors).toEqual(['retail_banking'])
  })
})

import { describe, expect, it } from 'vitest'
import type { IdealAccountProfile } from '@bellum/contracts'
import { autopilotPlan } from './discover-autopilot'
import { matchApplicationSectors } from './discover-sectors'

function icp(overrides: Partial<IdealAccountProfile> = {}): IdealAccountProfile {
  return { size: 'all', sectorsPriority: [], decisionLevel: 'operational', entryStrategy: 'topDown', ...overrides }
}

const ludovic = {
  priority_sectors: ['Banque de détail & Banque privée', 'Assurance & Mutuelles'],
  no_go_sectors: ['Chimie & Pharmaceutique'],
  ideal_client_size: ['50 à 500 salariés'],
}

describe('autopilotPlan — « Appliquer ma cible » complet (recette 21/10 U)', () => {
  it('(a) profil type Ludovic : secteurs, exclusions et 3 régions posés ; l’effectif NOMMÉ, jamais posé (#4516.6), chacun avec son origine', () => {
    const plan = autopilotPlan(icp(), ['84', '93', '27'], [], { answers: ludovic })
    expect(plan.basisKey).toBe('profile')
    expect(plan.filters.sectors).toEqual(matchApplicationSectors(ludovic.priority_sectors))
    expect(plan.filters.excludeSectors).toEqual(matchApplicationSectors(['Chimie & Pharmaceutique']))
    expect(plan.filters.excludeSectors.length).toBeGreaterThan(0)
    expect(plan.filters.headcount).toEqual([])
    expect(plan.also.find(a => a.key === 'ideal_client_size')?.values.length).toBeGreaterThan(0)
    expect(plan.filters.region).toEqual(['84', '93', '27'])
    const origins = Object.fromEntries(plan.criteria.map(c => [c.key, c.originKey]))
    expect(origins).toMatchObject({
      sector: 'profileSectors',
      excludeSector: 'profileNoGo',
      region: 'profileZones',
    })
  })

  it('(b) profil type Loïc : « PME indépendante » n’est pas posée (#4529.9) — NOMMÉE « aussi déclaré »', () => {
    const plan = autopilotPlan(icp(), [], [], {
      answers: {
        priority_sectors: ['Assurance & Mutuelles'],
        ideal_client_structure: ['PME indépendante / familiale'],
      },
    })
    expect(plan.filters.companyCategory).toEqual([])
    expect(plan.filters.excludeListed).toBe(false)
    expect(plan.criteria.map(c => c.key)).not.toContain('category')
    expect(plan.criteria.map(c => c.key)).not.toContain('excludeListed')
    expect(plan.also).toContainEqual({ key: 'ideal_client_structure', values: ['PME indépendante / familiale'] })
  })

  it('#4529.9 — target_company_types BRUT : aucune catégorie posée, les types déclarés sont NOMMÉS', () => {
    const declared = ['ETI (500-5 000 salariés)', 'PME (50-500 salariés)', 'Startups & Scale-ups']
    const plan = autopilotPlan(icp(), [], [], {
      answers: { priority_sectors: ['Assurance & Mutuelles'], target_company_types: declared },
    })
    expect(plan.filters.companyCategory).toEqual([])
    expect(plan.criteria.map(c => c.key)).not.toContain('category')
    expect(plan.also).toContainEqual({ key: 'target_company_types', values: declared })
  })

  it('#4529.9 — un profil qui ne déclare QUE des catégories ne fait pas une cible : repli marché, catégories nommées', () => {
    const plan = autopilotPlan(icp(), [], [], { answers: { target_company_types: ['PME (50-500 salariés)'] } })
    expect(plan.basisKey).toBe('profileThin')
    expect(plan.filters.companyCategory).toEqual([])
    expect(plan.also).toContainEqual({ key: 'target_company_types', values: ['PME (50-500 salariés)'] })
  })

  it('#4516.6 — ni ideal_client_size ni icp.size ne posent de tranche : la taille déclarée est NOMMÉE', () => {
    const plan = autopilotPlan(icp({ size: 'grandCompte' }), [], [], {
      answers: { priority_sectors: ['Assurance & Mutuelles'], ideal_client_size: ['Moins de 50 salariés'] },
    })
    expect(plan.filters.headcount).toEqual([])
    expect(plan.also).toContainEqual({ key: 'ideal_client_size', values: ['Moins de 50 salariés'] })
  })

  it('décideurs : personas et niveau du profil → decisionLevels ; séniorités vendues → seniorities', () => {
    const plan = autopilotPlan(icp({ decisionLevel: 'manager' }), [], [], {
      answers: {
        priority_sectors: ['Assurance & Mutuelles'],
        decision_maker_personas: [
          'CTO / Directeur Technique',
          'Responsable Applicatif / Delivery',
          "DSI / Directeur des Systèmes d'Information",
        ],
      },
      soldSeniority: ['senior'],
    })
    expect(plan.filters.decisionLevels.sort()).toEqual(['c_level', 'n1', 'n2'])
    expect(plan.filters.seniorities).toEqual(['senior'])
  })

  it('l’opérationnel ne pose aucun niveau de décision', () => {
    const plan = autopilotPlan(icp({ decisionLevel: 'operational' }), [], [], {
      answers: { priority_sectors: ['Assurance & Mutuelles'] },
    })
    expect(plan.filters.decisionLevels).toEqual([])
  })

  it('(c) profil vide : le repli marché est INCHANGÉ', () => {
    const plan = autopilotPlan(icp(), [], [], { answers: {} })
    expect(plan.basisKey).toBe('profileThin')
    expect(plan.criteria.map(c => c.key)).toEqual(['window', 'sources'])
    expect(plan.also).toEqual([])
  })

  it('(d) option inconnue : non posée, mais nommée dans « aussi dans ta cible »', () => {
    const plan = autopilotPlan(icp(), [], [], {
      answers: {
        priority_sectors: ['Assurance & Mutuelles'],
        ideal_client_size: ['Entre 3 et 4 salariés'],
        ideal_client_structure: ['Filiale de groupe'],
      },
    })
    expect(plan.filters.headcount).toEqual([])
    expect(plan.also).toEqual(
      expect.arrayContaining([
        { key: 'ideal_client_size', values: ['Entre 3 et 4 salariés'] },
        { key: 'ideal_client_structure', values: ['Filiale de groupe'] },
      ]),
    )
  })

  it('(e) un champ vide ne fait aucune ligne ; un champ renseigné non filtrable se nomme avec sa valeur', () => {
    const plan = autopilotPlan(icp(), [], [], {
      answers: {
        priority_sectors: ['Assurance & Mutuelles'],
        ideal_client_maturity: ['Client en forte croissance'],
        ideal_client_min_deal_size: '10 000 à 50 000 €',
        ideal_client_max_sales_cycle: '',
        ideal_client_accessibility: null,
        expertise_areas: [],
      },
    })
    expect(plan.also).toEqual([
      { key: 'ideal_client_maturity', values: ['Client en forte croissance'] },
      { key: 'ideal_client_min_deal_size', values: ['10 000 à 50 000 €'] },
    ])
  })
})

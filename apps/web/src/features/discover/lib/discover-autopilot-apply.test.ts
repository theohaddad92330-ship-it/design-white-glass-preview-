import { describe, expect, it } from 'vitest'
import type { IdealAccountProfile } from '@bellum/contracts'
import { autopilotPlan } from './discover-autopilot'
import { applyPlanToFilters } from './discover-autopilot-apply'
import { emptyUnifiedFilters, type UnifiedFilters } from './discover-filters'

const icp: IdealAccountProfile = {
  size: 'all',
  sectorsPriority: [],
  decisionLevel: 'director',
  entryStrategy: 'topDown',
}

const fullPlan = () =>
  autopilotPlan(icp, ['84', '93', '27'], [], {
    answers: {
      priority_sectors: ['Assurance & Mutuelles'],
      no_go_sectors: ['Chimie & Pharmaceutique'],
      ideal_client_size: ['50 à 500 salariés'],
      ideal_client_structure: ['PME indépendante / familiale'],
      target_company_types: ['ETI (500-5 000 salariés)'],
    },
    soldSeniority: ['senior'],
  })

describe('applyPlanToFilters — « Appliquer » recopie TOUT ce que le plan pose (recette 21/10 U.2)', () => {
  it('chaque clé non vide du plan arrive dans les filtres appliqués', () => {
    const plan = fullPlan()
    const applied = applyPlanToFilters(emptyUnifiedFilters(), plan)
    const empty = emptyUnifiedFilters()
    const posed = (Object.keys(plan.filters) as (keyof UnifiedFilters)[]).filter(
      key => JSON.stringify(plan.filters[key]) !== JSON.stringify(empty[key]),
    )
    expect(posed).toEqual(
      expect.arrayContaining(['sectors', 'excludeSectors', 'region', 'decisionLevels', 'seniorities']),
    )
    for (const key of posed) expect(applied[key]).toEqual(plan.filters[key])
  })

  it('#4529.9 — le plan ne pose ni taille ni catégorie, même avec un profil qui en déclare', () => {
    const plan = fullPlan()
    expect(plan.filters.headcount).toEqual([])
    expect(plan.filters.companyCategory).toEqual([])
    expect(plan.filters.excludeListed).toBe(false)
  })

  it('#4529.9 — une taille ajoutée à la main est appliquée telle quelle, « Ma cible » ne l’écrase pas', () => {
    const manual = { ...emptyUnifiedFilters(), headcount: ['50-249' as const], companyCategory: ['ETI'] }
    const applied = applyPlanToFilters(manual, fullPlan())
    expect(applied.headcount).toEqual(['50-249'])
    expect(applied.companyCategory).toEqual(['ETI'])
  })

  it('ne touche pas ce que le plan ne pose pas (une exclusion saisie à la main reste)', () => {
    const current = { ...emptyUnifiedFilters(), city: 'Lyon', freetext: 'cloud' }
    const applied = applyPlanToFilters(current, fullPlan())
    expect(applied.city).toBe('Lyon')
    expect(applied.freetext).toBe('cloud')
  })

  it('sans zone déclarée, le territoire choisi à la main n’est pas écrasé', () => {
    const plan = autopilotPlan(icp, [], [], { answers: { priority_sectors: ['Assurance & Mutuelles'] } })
    const applied = applyPlanToFilters({ ...emptyUnifiedFilters(), region: ['76'] }, plan)
    expect(applied.region).toEqual(['76'])
  })

  it('les secteurs choisis au dialogue (> 5) remplacent ceux du plan', () => {
    const applied = applyPlanToFilters(emptyUnifiedFilters(), fullPlan(), ['insurance'])
    expect(applied.sectors).toEqual(['insurance'])
  })

  it('le repli marché ne pose que les signaux', () => {
    const plan = autopilotPlan(icp, [], [], {})
    // icp.decisionLevel « director » seul ne fait pas une cible
    expect(plan.basisKey).toBe('profileThin')
    const applied = applyPlanToFilters(emptyUnifiedFilters(), plan)
    expect(applied.signalSources).toEqual(plan.filters.signalSources)
    expect(applied.sinceDays).toBe(plan.filters.sinceDays)
    expect(applied.decisionLevels).toEqual([])
  })
})

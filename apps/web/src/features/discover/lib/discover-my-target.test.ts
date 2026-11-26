import { describe, expect, it } from 'vitest'
import type { IdealAccountProfile } from '@bellum/contracts'
import { autopilotPlan } from './discover-autopilot'
import { emptyUnifiedFilters } from './discover-filters'
import { poseMyTarget, retireMyTarget } from './discover-my-target'

const icp: IdealAccountProfile = {
  size: 'all',
  sectorsPriority: [],
  decisionLevel: 'director',
  entryStrategy: 'topDown',
}

const profilePlan = () =>
  autopilotPlan(icp, ['84', '93'], [], {
    answers: { priority_sectors: ['Assurance & Mutuelles'], target_company_types: ['ETI (500-5 000 salariés)'] },
  })

describe('#4530.2 / #4530.3 — « Ma cible » pose les critères du profil, et RETIRE ceux-là', () => {
  it('pose secteurs et zone du profil, et nomme ce qu’elle a posé', () => {
    const plan = profilePlan()
    const { filters, posed } = poseMyTarget(emptyUnifiedFilters(), plan)
    expect(filters.sectors.length).toBeGreaterThan(0)
    expect(filters.region).toEqual(['84', '93'])
    expect(posed.region).toEqual(['84', '93'])
    expect(posed.sectors).toEqual(filters.sectors)
  })

  it('#4529.9 — le profil déclare une catégorie (ETI) : « Ma cible » ne pose aucun critère taille/catégorie', () => {
    const { filters, posed } = poseMyTarget(emptyUnifiedFilters(), profilePlan())
    for (const key of ['headcount', 'companyCategory', 'excludeListed'] as const) {
      expect(filters[key]).toEqual(emptyUnifiedFilters()[key])
      expect(posed).not.toHaveProperty(key)
    }
  })

  it('#4529.9 — une taille ajoutée à la main avant (ou après) « Ma cible » reste, et survit au retrait', () => {
    const manual = { ...emptyUnifiedFilters(), headcount: ['250-999' as const] }
    const { filters, posed } = poseMyTarget(manual, profilePlan())
    expect(filters.headcount).toEqual(['250-999'])
    expect(retireMyTarget(filters, posed).headcount).toEqual(['250-999'])
  })

  it('re-clic : les critères posés par le bouton partent, ceux posés à la main ensuite restent', () => {
    const { filters, posed } = poseMyTarget(emptyUnifiedFilters(), profilePlan())
    const withHandPicked = { ...filters, region: [...filters.region, '11'], freetext: 'java' }
    const retired = retireMyTarget(withHandPicked, posed)
    expect(retired.region).toEqual(['11'])
    expect(retired.sectors).toEqual([])
    expect(retired.freetext).toBe('java')
  })

  it('SAIT DIRE NON — un secteur déjà posé à la main n’est pas « posé par le bouton », il survit au retrait', () => {
    const plan = profilePlan()
    const handSector = plan.filters.sectors[0]!
    const { filters, posed } = poseMyTarget({ ...emptyUnifiedFilters(), region: ['11'] }, plan)
    expect(posed.region).toEqual(['84', '93'])
    expect(filters.sectors).toContain(handSector)
    expect(retireMyTarget(filters, posed).region).toEqual([])
  })

  it('un profil inexploitable (repli marché) ne pose AUCUN critère — rien d’inventé', () => {
    const plan = autopilotPlan(null, [], [], {})
    expect(plan.basisKey).not.toBe('profile')
    const { filters, posed } = poseMyTarget(emptyUnifiedFilters(), plan)
    expect(filters).toEqual(emptyUnifiedFilters())
    expect(posed).toEqual({})
  })

  it('#3528 — les secteurs choisis (5 au plus) remplacent ceux du plan', () => {
    const plan = profilePlan()
    const { filters, posed } = poseMyTarget(emptyUnifiedFilters(), plan, ['banque'])
    expect(filters.sectors).toEqual(['banque'])
    expect(posed.sectors).toEqual(['banque'])
  })
})

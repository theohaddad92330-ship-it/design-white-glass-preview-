import { RADAR_POCKETS } from '@bellum/contracts'
import { DEMO_TECHNOLOGY_RADAR_COVERAGE } from './demo-coverage'
import { demoTechnologyRadar } from './demo-technology-radar'

/**
 * #4282.13 (craft rule n°9) — le radar par technologie est SEMÉ dans la salle :
 * « radar SAP » rend les sept blocs, chacun rempli, sans probabilité ni source
 * nommée, chaque preuve datée et liée, dans l'ordre des trois poches.
 */
describe('#4282.13 — le radar SAP est visible dans la salle démo', () => {
  const now = new Date('2026-10-19T08:00:00Z')

  it('les sept blocs sont remplis', () => {
    expect(DEMO_TECHNOLOGY_RADAR_COVERAGE.state).toBe('seede')
    const radar = demoTechnologyRadar('radar SAP France', now)
    expect(radar?.technology.code).toBe('SAP')
    const accounts = radar?.accounts ?? []
    expect(accounts.flatMap(a => a.missions).length).toBeGreaterThan(0) // 1. missions
    expect(accounts.some(a => a.pocket === 'programs' && a.program)).toBe(true) // 2. programmes
    expect(accounts.some(a => a.pocket === 'rank_2' && a.awardedTender)).toBe(true) // 3. rang 2
    expect(radar?.historicalNeeds.length).toBeGreaterThan(0) // 4. historique
    expect(radar?.prescribers.some(p => p.freshness.kind === 'to_revalidate')).toBe(true) // 5. relais
    expect(radar?.footprints.every(f => f.label === 'profils observés')).toBe(true) // 6. empreinte
    const pockets = accounts.map(a => RADAR_POCKETS.indexOf(a.pocket)) // 7. poches ordonnées
    expect(pockets).toEqual([...pockets].sort((a, b) => a - b))
    expect(accounts.map(a => a.rank)).toEqual(accounts.map((_, i) => i + 1))
  })

  it('un publieur à client masqué est la cible ; aucune date ne vieillit', () => {
    const radar = demoTechnologyRadar('SAP', now)
    expect(radar?.accounts[0]?.targetIsPublisher).toBe(true)
    const later = demoTechnologyRadar('SAP', new Date('2027-03-01T08:00:00Z'))
    expect(later?.accounts[0]?.missions[0]?.publishedAt).toBe('2027-02-26')
  })

  it('sait dire NON : aucune probabilité, aucune source nommée, et hors SAP la salle le dit', () => {
    const dumped = JSON.stringify(demoTechnologyRadar('SAP', now)).toLowerCase()
    expect(dumped).not.toMatch(/prob|percent|%|dataforge|orion|france travail|boamp|decp/)
    const other = demoTechnologyRadar('Workday', now)
    expect(other?.accounts).toEqual([])
    expect(other?.notEvaluated[0]).toMatch(/démonstration/)
    expect(demoTechnologyRadar('  ', now)).toBeNull()
  })
})

import { DEMO_CRM_COUNTER_MISSIONS } from './demo-crm-counters'

/** #4193 — au moins une mission dans chaque fenêtre 30/60/90 sur SNCF et sur Orange. */
describe('démo — compteurs de fin de mission', () => {
  const windowOf = (days: number) => (days <= 30 ? 30 : days <= 60 ? 60 : 90)

  it.each(['SNCF', 'Orange'] as const)('%s a une mission dans CHAQUE fenêtre', account => {
    const windows = new Set(
      DEMO_CRM_COUNTER_MISSIONS.filter(mission => mission.account === account).map(m => windowOf(m.ends_in_days)),
    )
    expect([...windows].sort()).toEqual([30, 60, 90])
  })

  it('aucune mission semée n’est déjà terminée ni sans date de fin', () => {
    for (const mission of DEMO_CRM_COUNTER_MISSIONS) {
      expect(mission.ends_in_days).toBeGreaterThan(0)
      expect(mission.ends_in_days).toBeLessThanOrEqual(90)
    }
  })

  it('les libellés sont uniques (une mission par ligne)', () => {
    const labels = DEMO_CRM_COUNTER_MISSIONS.map(m => m.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})

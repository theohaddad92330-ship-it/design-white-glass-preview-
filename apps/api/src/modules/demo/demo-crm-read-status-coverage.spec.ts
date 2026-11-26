import { demoCrmReadStatus } from './demo-dataset'

/**
 * #4189.8 (R46) — la salle montre le conflit de synchro sur le CRM qu'elle présente « branché » (HubSpot,
 * « CRM fictif ») : une ligne sur un autre outil ne s'affichait sur aucune carte visible.
 */
describe('démo — état de lecture CRM (#4189.8)', () => {
  it('la ligne fictive est celle de HubSpot, marquée démo, avec un écart proposé (rien d’appliqué)', () => {
    const status = demoCrmReadStatus(new Date('2026-10-17T10:00:00Z'))
    expect(status.provider).toBe('hubspot')
    expect(status.demo).toBe(true)
    const items = status.conflictItems ?? []
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      field: 'company_name',
      bellumValue: expect.any(String),
      crmValue: expect.any(String),
    })
  })
})

import { CrmReadSyncService } from './crm-read-sync.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'

/**
 * #4189 — les conflits se LISENT là où la synchro se lit : `status()` rend, par CRM branché, les
 * écarts PROPOSÉS (valeur Bellum gardée / valeur du CRM). Rien n'est appliqué : proposer ≠ écrire.
 */
function build(
  events: Array<Record<string, unknown>>,
  connected = true,
  demo = false,
  touches: Array<Record<string, unknown>> = [],
) {
  const query = jest.fn(async (sql: string) =>
    sql.includes('sync_record_events') ? events : sql.includes('field_provenance') ? touches : [],
  )
  const cursors = { find: jest.fn(async () => []), manager: { query } }
  const registry = {
    connected: async () => (connected ? [{ adapter: { provider: 'salesforce' }, accountLabel: 'Espace' }] : []),
  }
  const service = new CrmReadSyncService(
    registry as never,
    {} as never,
    cursors as never,
    { find: async () => [] } as never,
    { resolveActiveWorkspace: async () => ({ workspaceId: WORKSPACE }), isDemoWorkspace: async () => demo } as never,
  )
  return { service, query }
}

const EVENT = {
  provider: 'salesforce',
  entity_type: 'contact',
  proposal: { email: { bellum: 'corrige@acme.fr', crm: 'autre@crm.fr' } },
  created_at: new Date('2026-10-14T04:55:00.000Z'),
}

describe('CrmReadSyncService.status — les conflits proposés (#4189)', () => {
  it('chaque écart sort avec sa valeur Bellum gardée et sa valeur CRM, datés du passage', async () => {
    const { service } = build([EVENT])
    const [row] = await service.status('u1')
    expect(row?.conflictItems).toEqual([
      {
        entityType: 'contact',
        field: 'email',
        bellumValue: 'corrige@acme.fr',
        crmValue: 'autre@crm.fr',
        at: '2026-10-14T04:55:00.000Z',
      },
    ])
  })

  it('⚠️ SAIT DIRE NON — un conflit d’un autre CRM ne sort pas chez celui-ci', async () => {
    const { service } = build([{ ...EVENT, provider: 'pipedrive' }])
    const [row] = await service.status('u1')
    expect(row?.conflictItems).toEqual([])
  })

  it('⚠️ SAIT DIRE NON — un ancien conflit sans proposition ne fait aucune ligne', async () => {
    const { service } = build([{ ...EVENT, proposal: null }])
    const [row] = await service.status('u1')
    expect(row?.conflictItems).toEqual([])
  })

  it('aucun CRM branché : aucune lecture des conflits', async () => {
    const { service, query } = build([EVENT], false)
    expect(await service.status('u1')).toEqual([])
    expect(query).not.toHaveBeenCalled()
  })

  // #4189.8 (Louis 15/10/2026) — la démonstration MONTRE un conflit, présenté comme une proposition.
  it('en salle de démonstration : un conflit fictif, marqué démo, proposé — rien d’appliqué, aucune lecture en base', async () => {
    const { service, query } = build([], false, true)
    const [row] = await service.status('u1')
    expect(row?.demo).toBe(true)
    expect(row?.conflicts).toBe(2)
    expect(row?.conflictItems).toEqual([
      expect.objectContaining({
        entityType: 'account',
        entityLabel: 'Société Générale',
        field: 'company_name',
        bellumValue: expect.any(String),
        crmValue: expect.any(String),
      }),
      expect.objectContaining({ entityType: 'account', entityLabel: 'Orange', field: 'company_name' }),
    ])
    expect(query).not.toHaveBeenCalled()
  })

  it('⚠️ SAIT DIRE NON — hors démonstration, aucun CRM branché reste une liste vide', async () => {
    const { service } = build([EVENT], false, false)
    expect(await service.status('u1')).toEqual([])
  })

  it('un vrai CRM branché en salle ne reçoit PAS le conflit fictif', async () => {
    const { service } = build([EVENT], true, true)
    const rows = await service.status('u1')
    expect(rows.every(row => row.demo !== true)).toBe(true)
  })

  // #4189.9 — l'écart tranché depuis (garder le CRM, ou correction humaine postérieure) ne se repropose pas.
  it('⚠️ SAIT DIRE NON — un écart déjà tranché par un geste humain postérieur ne se repropose pas', async () => {
    const internal = 'c0000000-0000-4000-8000-000000000001'
    const event = { ...EVENT, id: 'e1', internal_id: internal }
    const resolved = build([event], true, false, [
      { entity_id: internal, field: 'email', observed_at: new Date('2026-10-15T09:00:00.000Z') },
    ])
    expect((await resolved.service.status('u1'))[0]?.conflictItems).toEqual([])
    const stale = build([event], true, false, [
      { entity_id: internal, field: 'email', observed_at: new Date('2026-10-01T09:00:00.000Z') },
    ])
    expect((await stale.service.status('u1'))[0]?.conflictItems).toEqual([expect.objectContaining({ id: 'e1' })])
  })

  // Théo D settings-integrations.N3 — l'onglet « À relire » nomme la fiche concernée.
  it('Théo D settings-integrations.N3 — l’écart porte le nom de la fiche', async () => {
    const event = {
      ...EVENT,
      id: 'e2',
      internal_id: 'c0000000-0000-4000-8000-000000000002',
      entity_label: 'Paul Ferrer',
    }
    const { service } = build([event])
    const [row] = await service.status('u1')
    expect(row?.conflictItems?.[0]).toMatchObject({ entityLabel: 'Paul Ferrer' })
  })

  it('Théo D settings-integrations.N3 — ⚠️ SAIT DIRE NON : un champ déjà tranché « garder Bellum » ne se repropose pas', async () => {
    const event = {
      ...EVENT,
      id: 'e3',
      internal_id: 'c0000000-0000-4000-8000-000000000003',
      proposal: {
        email: { bellum: 'a@acme.fr', crm: 'b@crm.fr' },
        full_name: { bellum: 'Paul Ferrer', crm: 'P. Ferrer' },
      },
      kept_fields: ['email'],
    }
    const { service } = build([event])
    const [row] = await service.status('u1')
    expect(row?.conflictItems?.map(item => item.field)).toEqual(['full_name'])
  })

  // Théo D settings-integrations.N4 — l'historique des échanges.
  it('Théo D settings-integrations.N4 — hors démonstration, un journal vide reste une liste vide (rien d’inventé)', async () => {
    const { service } = build([], false, false)
    expect(await service.exchanges('u1')).toEqual([])
  })

  it('Théo D settings-integrations.N4 — en salle de démonstration, journal vide : des lignes marquées démo', async () => {
    const { service } = build([], false, true)
    const items = await service.exchanges('u1')
    expect(items.length).toBeGreaterThan(0)
    expect(items.every(item => item.demo === true)).toBe(true)
  })

  it('Théo D settings-integrations.N4 — un journal réel n’est jamais mêlé aux lignes de démonstration', async () => {
    const { service, query } = build([], true, true)
    query.mockImplementationOnce(async () => [
      { id: 'x', kind: 'read', provider: 'hubspot', entity_type: 'contact', at: new Date(), created: 1, conflicts: 0 },
    ])
    const items = await service.exchanges('u1')
    expect(items.map(item => item.id)).toEqual(['x'])
    expect(items[0]?.demo).toBeUndefined()
  })
})

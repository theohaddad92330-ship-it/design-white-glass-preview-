import { listGroupEntities } from './account-group-entities'

// #4158 EX-03 (.60/.61/.62) — une fiche PAR ENTITÉ d'un groupe, rattachée au groupe.
const WS = '11111111-1111-1111-1111-111111111111'
const BU = '22222222-2222-2222-2222-222222222222'

function runner(rows: unknown[]) {
  const query = jest.fn().mockResolvedValue(rows)
  return { query, manager: { query } }
}

describe('listGroupEntities (#4158 EX-03)', () => {
  it('rend les AUTRES comptes du groupe, chacun avec son propre responsable et ses compteurs', async () => {
    const { manager } = runner([
      {
        id: 'b',
        company_name: 'Orange Business',
        group_role: 'filiale',
        assigned_to: 'u-2',
        open_actions: '3',
        notes: '2',
      },
      {
        id: 'c',
        company_name: 'Orange France',
        group_role: 'filiale',
        assigned_to: null,
        open_actions: '0',
        notes: '0',
      },
    ])
    const out = await listGroupEntities(manager, 'a', WS, null)
    expect(out).toEqual([
      { id: 'b', companyName: 'Orange Business', role: 'filiale', ownerUserId: 'u-2', openActions: 3, notes: 2 },
      { id: 'c', companyName: 'Orange France', role: 'filiale', ownerUserId: null, openActions: 0, notes: 0 },
    ])
  })

  it('borne l’ESPACE et ne suit que la tête de groupe DÉCLARÉE (jamais un nom)', async () => {
    const { query, manager } = runner([])
    await listGroupEntities(manager, 'a', WS, null)
    const [sql, params] = query.mock.calls[0]!
    expect(sql).toContain('s.workspace_id = o.workspace_id')
    expect(sql).toContain('group_head_siren')
    expect(sql).not.toMatch(/company_name\s+(I?LIKE|=)/i)
    expect(params[1]).toBe(WS)
  })

  it('SAIT DIRE NON — un membre cloisonné ne voit que les entités de son périmètre (clause BU)', async () => {
    const { query, manager } = runner([])
    await listGroupEntities(manager, 'a', WS, { businessUnitIds: [BU], includeUnassigned: true })
    const [sql] = query.mock.calls[0]!
    expect(sql).toContain(`'${BU}'::uuid`)
    expect(sql).toContain('s.business_unit_id')
  })

  it('sans cloisonnement, la requête ne porte aucune clause BU (byte-identique)', async () => {
    const { query, manager } = runner([])
    await listGroupEntities(manager, 'a', WS, null)
    expect(query.mock.calls[0]![0]).not.toContain('business_unit_id')
  })

  it('les compteurs de notes et d’actions sont ceux de l’ENTITÉ (account_id / entity_id), jamais du groupe', async () => {
    const { query, manager } = runner([])
    await listGroupEntities(manager, 'a', WS, null)
    const [sql] = query.mock.calls[0]!
    expect(sql).toContain('ua.account_id = s.id')
    expect(sql).toContain('FROM action_plan_items ua')
    expect(sql).toContain("n.entity_type = 'account' AND n.entity_id = s.id")
  })
})

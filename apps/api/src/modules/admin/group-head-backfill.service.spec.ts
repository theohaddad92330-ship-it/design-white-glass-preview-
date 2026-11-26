import { GroupHeadBackfillService } from './group-head-backfill.service'

const WS = '11111111-1111-4111-8111-111111111111'

function build(rows: Array<{ id: string; siren: string; group_head_siren: string }>, answers: Record<string, unknown>) {
  const query = jest.fn().mockResolvedValue(rows)
  const updates: Array<{ id: string; head: string }> = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      if (/^\s*UPDATE accounts/i.test(sql)) updates.push({ id: params[1] as string, head: params[0] as string })
      return []
    }),
  }
  const dataSource = { query, manager }
  const groupAffiliation = jest.fn(async (siren: string) => answers[siren] ?? null)
  const service = new GroupHeadBackfillService(dataSource as never, { groupAffiliation } as never)
  return { service, query, updates, groupAffiliation }
}

describe('GroupHeadBackfillService — rattrapage ciblé de group_head_siren (#3917)', () => {
  it('exige un espace', async () => {
    const { service } = build([], {})
    await expect(service.run({ workspaceId: ' ' })).rejects.toThrow(/workspaceId/)
  })

  it('la sélection porte workspace_id, exclut les liens corrigés à la main et plafonne à 100', async () => {
    const { service, query } = build([], {})
    await service.run({ workspaceId: WS, limit: 5000, afterId: '22222222-2222-4222-8222-222222222222' })
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/workspace_id = \$1/)
    expect(sql).toMatch(/field_provenance/)
    expect(sql).toMatch(/'human'/)
    expect(sql).toMatch(/group_link_source = 'pappers'/)
    expect(sql).toMatch(/id > \$2/)
    expect(params).toEqual([WS, '22222222-2222-4222-8222-222222222222', 100])
  })

  it('met à jour quand le registre confirme une AUTRE tête, jamais autrement', async () => {
    const { service, updates } = build(
      [
        { id: 'a1', siren: '111111111', group_head_siren: '318456324' },
        { id: 'a2', siren: '222222222', group_head_siren: '999999999' },
      ],
      {
        '111111111': { role: 'filiale', headSiren: '552222222', headName: 'X SA' },
        '222222222': { role: 'filiale', headSiren: '999999999', headName: 'Y SA' },
      },
    )
    const out = await service.run({ workspaceId: WS })
    expect(updates).toEqual([{ id: 'a1', head: '552222222' }])
    expect(out).toMatchObject({ processed: 2, updated: 1, unchanged: 1, unconfirmed: 0, nextCursor: 'a2' })
  })

  it('sait dire NON : une réponse muette ou « groupe » ne touche à rien, le compte est nommé non confirmé', async () => {
    const { service, updates } = build(
      [
        { id: 'a1', siren: '111111111', group_head_siren: '318456324' },
        { id: 'a2', siren: '222222222', group_head_siren: '318456324' },
      ],
      { '222222222': { role: 'groupe', headSiren: '222222222', headName: 'Z' } },
    )
    const out = await service.run({ workspaceId: WS })
    expect(updates).toEqual([])
    expect(out).toMatchObject({ updated: 0, unconfirmed: 2 })
    expect(out.unconfirmedIds).toEqual(['a1', 'a2'])
  })

  it('un compte en échec ne coupe pas le lot', async () => {
    const { service, groupAffiliation } = build(
      [
        { id: 'a1', siren: '111111111', group_head_siren: '1' },
        { id: 'a2', siren: '222222222', group_head_siren: '2' },
      ],
      {},
    )
    groupAffiliation.mockRejectedValueOnce(new Error('boom'))
    const out = await service.run({ workspaceId: WS })
    expect(out).toMatchObject({ processed: 2, failed: 1, unconfirmed: 1 })
  })
})

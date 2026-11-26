import { AnalysisRunsService } from './analysis-runs.service'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { createMockRepository } from '../../database/test-utils'

const VIEWER = '11111111-1111-4111-8111-111111111111'
const COLLEAGUE = '22222222-2222-4222-8222-222222222222'
const ACCOUNT = '33333333-3333-4333-8333-333333333333'
const RUN = '44444444-4444-4444-8444-444444444444'
const BU = '55555555-5555-4555-8555-555555555555'

function row(over: Record<string, unknown> = {}) {
  return {
    id: RUN,
    account_id: ACCOUNT,
    company_name: 'Altiver Industries',
    headquarters: 'Lyon',
    status: 'completed',
    scope_mode: 'france',
    depth: 'deep',
    created_at: new Date('2026-10-16T09:45:00Z'),
    completed_at: new Date('2026-10-16T09:51:00Z'),
    user_id: VIEWER,
    first_name: 'Théo',
    last_name: 'Haddad',
    ...over,
  }
}

function build(rows: unknown[]) {
  const repo = createMockRepository<AnalysisRunEntity>()
  repo.query.mockResolvedValue(rows)
  return { service: new AnalysisRunsService(repo as never), repo }
}

describe('Théo B r2-mes-analyses.N1/A5 — l’historique des analyses de l’espace', () => {
  it('lit l’ESPACE par défaut, sans les lignes que l’appelant a retirées', async () => {
    const { service, repo } = build([row()])
    const out = await service.listHistory({
      workspaceId: 'ws',
      viewerId: VIEWER,
      scope: 'space',
      businessUnitScope: null,
    })
    const [sql, params] = repo.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('r.workspace_id = $1')
    expect(sql).toContain('NOT ($2::uuid = ANY(r.hidden_by_user_ids))')
    expect(sql).not.toContain('r.user_id = $2')
    expect(params.slice(0, 2)).toEqual(['ws', VIEWER])
    expect(out.runs).toHaveLength(1)
  })

  it('« moi » restreint aux runs de l’appelant', async () => {
    const { service, repo } = build([row()])
    await service.listHistory({ workspaceId: 'ws', viewerId: VIEWER, scope: 'me', businessUnitScope: null })
    const [sql] = repo.query.mock.calls[0] as [string]
    expect(sql).toContain('r.user_id = $2')
  })

  it('tient le périmètre d’unité : un compte hors périmètre n’apparaît pas', async () => {
    const { service, repo } = build([])
    await service.listHistory({
      workspaceId: 'ws',
      viewerId: VIEWER,
      scope: 'space',
      businessUnitScope: { businessUnitIds: [BU], includeUnassigned: true },
    })
    const [sql, params] = repo.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('a.business_unit_id IN')
    expect(params).toContainEqual([BU])
  })

  it('nomme qui a lancé, marque « mine », et ne devine ni profondeur ni nom', async () => {
    const { service } = build([
      row(),
      row({
        id: '66666666-6666-4666-8666-666666666666',
        user_id: COLLEAGUE,
        first_name: null,
        last_name: null,
        depth: null,
        company_name: null,
      }),
    ])
    const out = await service.listHistory({
      workspaceId: 'ws',
      viewerId: VIEWER,
      scope: 'space',
      businessUnitScope: null,
    })
    expect(out.runs[0]).toMatchObject({ mine: true, depth: 'deep', startedBy: { userId: VIEWER, name: 'Théo Haddad' } })
    expect(out.runs[1]).toMatchObject({ mine: false, depth: null, companyName: null, startedBy: { name: null } })
    expect(out.counts).toEqual({ space: 2, mine: 1 })
  })

  it('une panne de lecture rend une liste vide, jamais une erreur sur l’écran', async () => {
    const repo = createMockRepository<AnalysisRunEntity>()
    repo.query.mockRejectedValue(new Error('db down'))
    const service = new AnalysisRunsService(repo as never)
    await expect(
      service.listHistory({ workspaceId: 'ws', viewerId: VIEWER, scope: 'space', businessUnitScope: null }),
    ).resolves.toEqual({ runs: [], counts: { space: 0, mine: 0 } })
  })
})

describe('Théo B r2-mes-analyses.N1 — « Retirer cet élément de l’historique »', () => {
  it('masque la ligne pour l’appelant seul, sur un run de son espace qu’il a lancé', async () => {
    const { service, repo } = build([{ id: RUN }])
    await expect(service.hideForUser({ runId: RUN, userId: VIEWER, workspaceId: 'ws' })).resolves.toBe(true)
    const [sql, params] = repo.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('array_append(hidden_by_user_ids')
    expect(sql).toContain('user_id = $2')
    expect(sql).toContain('workspace_id = $3')
    expect(params).toEqual([RUN, VIEWER, 'ws'])
  })

  it('refuse le run d’un collègue : on ne touche pas à ce qu’un autre a lancé', async () => {
    const { service } = build([])
    await expect(service.hideForUser({ runId: RUN, userId: COLLEAGUE, workspaceId: 'ws' })).resolves.toBe(false)
  })
})

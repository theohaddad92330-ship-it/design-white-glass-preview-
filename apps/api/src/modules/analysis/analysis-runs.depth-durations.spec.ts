import { AnalysisRunsService } from './analysis-runs.service'

/**
 * #3288 — la durée d'un palier se MESURE sur les runs terminés de l'espace ;
 * sous trois runs elle reste « non mesurée » (`null`), jamais inventée.
 */
describe('AnalysisRunsService.medianSecondsByDepth (#3288)', () => {
  const build = (rows: Array<{ depth: string | null; seconds: number }>) => {
    const repo = { query: jest.fn().mockResolvedValue(rows) }
    return { service: new AnalysisRunsService(repo as never), repo }
  }

  it('un run sans profondeur enregistrée compte pour « vérifiée » — c’est l’analyse d’avant', async () => {
    const { service } = build([
      { depth: null, seconds: 100 },
      { depth: 'verified', seconds: 300 },
      { depth: null, seconds: 200 },
    ])
    expect(await service.medianSecondsByDepth('ws-1')).toEqual({ quick: null, verified: 200, deep: null })
  })

  it('sous trois runs, le palier est non mesuré', async () => {
    const { service } = build([
      { depth: 'deep', seconds: 500 },
      { depth: 'deep', seconds: 700 },
    ])
    expect((await service.medianSecondsByDepth('ws-1')).deep).toBeNull()
  })

  it('une lecture en échec ne mesure rien — jamais une durée devinée', async () => {
    const repo = { query: jest.fn().mockRejectedValue(new Error('db down')) }
    const service = new AnalysisRunsService(repo as never)
    expect(await service.medianSecondsByDepth('ws-1')).toEqual({ quick: null, verified: null, deep: null })
  })

  it('ne lit que l’espace demandé et que les runs terminés', async () => {
    const { service, repo } = build([])
    await service.medianSecondsByDepth('ws-1')
    const [sql, params] = repo.query.mock.calls[0]!
    expect(sql).toContain("status = 'completed'")
    expect(sql).toContain('workspace_id = $1')
    expect(params).toEqual(['ws-1'])
  })
})

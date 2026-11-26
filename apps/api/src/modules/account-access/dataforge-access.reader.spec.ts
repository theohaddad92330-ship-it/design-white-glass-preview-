import { readDataforgeAccess } from './dataforge-access.reader'

type Row = Record<string, unknown>
const fiche = (over: Row = {}): Row => ({
  source_id: 'DF-1',
  siren_siret: '552120222',
  group_name: null,
  cluster_id: null,
  sales_accessibility_level: 'HAUTE',
  barriere_plateforme: true,
  barriere_publique: false,
  referencing_process_found: null,
  supplier_portal: null,
  priority_level: 'P1',
  updated_at: new Date('2026-10-01T00:00:00Z'),
  ...over,
})
const run = (rows: Row[], input: Partial<Parameters<typeof readDataforgeAccess>[1]> = {}) => {
  const query = jest.fn(async () => rows)
  return {
    query,
    result: readDataforgeAccess(query as never, {
      siren: '552120222',
      groupHeadSiren: null,
      rawAnalysis: {},
      ...input,
    }),
  }
}

describe('readDataforgeAccess (lot 776)', () => {
  it('rend les statuts en énumérations métier, sans code brut ni identifiant de fiche', async () => {
    const { result } = run([fiche()])
    const view = await result
    expect(view).toEqual({
      accessibility: 'high',
      barriers: ['platform'],
      route: 'platform',
      priority: 'high',
      observedAt: '2026-10-01T00:00:00.000Z',
    })
    expect(JSON.stringify(view)).not.toMatch(/DF-1|HAUTE|P1|552120222/)
  })

  it('une fiche marquée doublon est écartée par la requête (jamais lue)', async () => {
    const { query, result } = run([])
    await result
    const calls = query.mock.calls as unknown as [string, unknown[]][]
    expect(calls[0]![0]).toMatch(/NOT est_doublon|est_doublon = false|NOT COALESCE\(est_doublon/)
  })

  it('sans SIREN valide ni repli : null, aucune requête', async () => {
    const { query, result } = run([], { siren: null })
    await expect(result).resolves.toBeNull()
    expect(query).not.toHaveBeenCalled()
  })

  it('plusieurs fiches d’une même grappe qui disent la même chose : une seule vue', async () => {
    const view = await run([fiche({ source_id: 'A', cluster_id: 'k1' }), fiche({ source_id: 'B', cluster_id: 'k1' })])
      .result
    expect(view?.accessibility).toBe('high')
  })

  it('une grappe CONTRADICTOIRE ne devine pas', async () => {
    const view = await run([
      fiche({ source_id: 'A', cluster_id: 'k1' }),
      fiche({ source_id: 'B', cluster_id: 'k1', sales_accessibility_level: 'FAIBLE' }),
    ]).result
    expect(view).toBeNull()
  })

  it('des fiches de groupes différents sur un même SIREN : rien', async () => {
    const view = await run([fiche({ source_id: 'A', cluster_id: 'k1' }), fiche({ source_id: 'B', cluster_id: 'k2' })])
      .result
    expect(view).toBeNull()
  })

  it('repli démo : raw_analysis.dataforge_access validé par le contrat', async () => {
    const demo = { accessibility: 'medium', barriers: [], route: 'referencing', priority: 'low', observedAt: null }
    expect(await run([], { rawAnalysis: { dataforge_access: demo } }).result).toEqual(demo)
    expect(await run([], { rawAnalysis: { dataforge_access: { accessibility: 'HAUTE' } } }).result).toBeNull()
  })

  it('une lecture en panne est une absence, jamais une erreur ni un zéro', async () => {
    const query = jest.fn(async () => {
      throw new Error('boom')
    })
    await expect(
      readDataforgeAccess(query as never, { siren: '552120222', groupHeadSiren: null, rawAnalysis: {} }),
    ).resolves.toBeNull()
  })
})

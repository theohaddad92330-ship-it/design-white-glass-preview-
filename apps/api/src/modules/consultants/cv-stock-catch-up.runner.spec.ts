import {
  formatStockCatchUpReport,
  isNeverReadStock,
  runStockCatchUp,
  STOCK_CATCH_UP_SPACING_MS,
  type StockCatchUpPort,
  type StockCandidateRow,
} from './cv-stock-catch-up.runner'

// #3883 — rattrapage du stock : tous les espaces, SEULEMENT les CV jamais lus.
const WS_A = 'a0000000-0000-4000-8000-00000000000a'
const WS_B = 'b0000000-0000-4000-8000-00000000000b'
const USER_A = 'u0000000-0000-4000-8000-00000000000a'
const USER_B = 'u0000000-0000-4000-8000-00000000000b'

const row = (id: string, over: Partial<StockCandidateRow> = {}): StockCandidateRow => ({
  id,
  workspace_id: WS_A,
  user_id: USER_A,
  cv_auto_read_at: null,
  review_status: 'to_review',
  archived_at: null,
  has_human: false,
  ...over,
})

function port(rows: StockCandidateRow[]) {
  const enqueue = jest.fn(async (..._args: unknown[]) => true)
  const service: StockCatchUpPort = { neverReadStockCandidates: jest.fn(async () => rows), enqueue }
  return { service, enqueue }
}

// Deux espaces : lues / non lues / corrigées à la main / qualifiée / archivée.
const STOCK: StockCandidateRow[] = [
  row('a-unread-1'),
  row('a-unread-2'),
  row('a-read', { cv_auto_read_at: '2026-10-05T10:00:00Z' }),
  row('a-human', { has_human: true }),
  row('a-qualified', { review_status: 'qualified' }),
  row('a-archived', { archived_at: '2026-09-01T00:00:00Z' }),
  row('b-unread', { workspace_id: WS_B, user_id: USER_B }),
  row('b-read', { workspace_id: WS_B, user_id: USER_B, cv_auto_read_at: new Date('2026-10-06T10:00:00Z') }),
  row('b-human', { workspace_id: WS_B, user_id: USER_B, has_human: true }),
]

describe('isNeverReadStock (#3883)', () => {
  it('sait dire NON : lue, corrigée à la main, qualifiée ou archivée ne partent jamais', () => {
    expect(STOCK.filter(isNeverReadStock).map(r => r.id)).toEqual(['a-unread-1', 'a-unread-2', 'b-unread'])
  })
})

describe('runStockCatchUp (#3883)', () => {
  it('SIMULATION par défaut : compte par espace, ne met rien en file', async () => {
    const { service, enqueue } = port(STOCK)
    const report = await runStockCatchUp({ service, apply: false, spacingMs: 0 })
    expect(report).toMatchObject({ mode: 'simulation', targeted: 3, selected: 3, queued: 0, creditsEstimated: 0 })
    expect(report.perWorkspace).toEqual({ [WS_A]: 2, [WS_B]: 1 })
    expect(enqueue).not.toHaveBeenCalled()
    expect(formatStockCatchUpReport(report)).toContain('SIMULATION')
  })

  it('--appliquer : seules les fiches non lues des DEUX espaces partent, chacune avec son propriétaire', async () => {
    const { service, enqueue } = port(STOCK)
    const report = await runStockCatchUp({ service, apply: true, spacingMs: 0 })
    const sent = enqueue.mock.calls.map(call => call.slice(0, 3))
    expect(sent).toEqual([
      [WS_A, USER_A, 'a-unread-1'],
      [WS_A, USER_A, 'a-unread-2'],
      [WS_B, USER_B, 'b-unread'],
    ])
    expect(report).toMatchObject({ mode: 'applique', queued: 3 })
  })

  it('débit borné : chaque fiche est espacée dans la file (pas de pic sur l’API)', async () => {
    const { service, enqueue } = port(STOCK)
    await runStockCatchUp({ service, apply: true, spacingMs: 20_000 })
    expect(enqueue.mock.calls.map(call => call[3])).toEqual([{ delay: 0 }, { delay: 20_000 }, { delay: 40_000 }])
  })

  // #3935 (lot BATCH-CV) — le débit est borné par le LIMITEUR de la file, plus par un espacement fixe.
  it('sans espacement demandé, tout part sans délai : le limiteur BullMQ borne le débit', async () => {
    const { service, enqueue } = port(STOCK)
    const report = await runStockCatchUp({ service, apply: true })
    expect(STOCK_CATCH_UP_SPACING_MS).toBe(0)
    expect(enqueue.mock.calls.map(call => call[3])).toEqual([{ delay: 0 }, { delay: 0 }, { delay: 0 }])
    expect(report.spacingMs).toBe(0)
  })

  it('--limite découpe en lots reprenables', async () => {
    const { service, enqueue } = port(STOCK)
    const report = await runStockCatchUp({ service, apply: true, limit: 2, spacingMs: 0 })
    expect(enqueue).toHaveBeenCalledTimes(2)
    expect(report).toMatchObject({ targeted: 3, selected: 2, queued: 2 })
  })

  it('idempotent : une fois lues (cv_auto_read_at posé), les mêmes fiches ne repartent plus', async () => {
    const afterRead = STOCK.map(r => (isNeverReadStock(r) ? { ...r, cv_auto_read_at: '2026-10-10T20:00:00Z' } : r))
    const { service, enqueue } = port(afterRead)
    const report = await runStockCatchUp({ service, apply: true, spacingMs: 0 })
    expect(enqueue).not.toHaveBeenCalled()
    expect(report).toMatchObject({ targeted: 0, queued: 0 })
  })

  it('une mise en file refusée (Redis) n’est pas comptée comme faite', async () => {
    const { service, enqueue } = port(STOCK)
    enqueue.mockResolvedValueOnce(false)
    const report = await runStockCatchUp({ service, apply: true, spacingMs: 0 })
    expect(report.queued).toBe(2)
  })
})

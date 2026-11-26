import type { WorkCounter, WorkFailure } from '@bellum/contracts'
import {
  WorkProgressService,
  isLotInScope,
  type AnalysisLotRef,
  type FamilyMeasures,
  type WorkProgressReader,
} from './work-progress.service'

// #4611 — Laura dit où en est le travail lancé. Les trois REFUS d'abord (.8, .5, .7), puis la forme.
const WS = 'ws-mine'
const OTHER_WS = 'ws-concurrent'
const NOW = new Date('2026-10-28T10:00:00Z')

const measured = (
  over: Partial<Record<WorkCounter, number | null>> = {},
  failures: WorkFailure[] = [],
): FamilyMeasures => ({
  measures: { launched: 4, done: 2, failed: 1, running: 1, ...over },
  since: '2026-10-26T09:00:00.000Z',
  lastActivityAt: '2026-10-28T09:30:00.000Z',
  failures,
})

/** Un lecteur en mémoire : deux espaces, un lot chacun. Il ne filtre RIEN par espace — c'est le service qui refuse. */
function reader(over: Partial<WorkProgressReader> = {}): WorkProgressReader & { calls: string[] } {
  const calls: string[] = []
  const lots: Record<string, AnalysisLotRef> = {
    'lot-mine': { id: 'lot-mine', workspaceId: WS, itemBusinessUnitIds: ['bu-1'] },
    'lot-other': { id: 'lot-other', workspaceId: OTHER_WS, itemBusinessUnitIds: [null] },
  }
  return {
    calls,
    findAnalysisLot: async id => lots[id] ?? null,
    analysis: async q => {
      calls.push(`analysis:${q.lotId ?? '*'}:${q.workspaceId}`)
      return measured()
    },
    imports: async () => measured(),
    enrichments: async () => measured(),
    crmSyncs: async () => measured(),
    lauraJobs: async () => measured(),
    ...over,
  }
}

const ask = (r: WorkProgressReader, extra: Partial<Parameters<WorkProgressService['read']>[0]> = {}) =>
  new WorkProgressService(r, () => NOW).read({
    workspaceId: WS,
    userId: 'u-1',
    businessUnitScope: null,
    ...extra,
  })

describe('#4611.8 — un lot d’un AUTRE espace rend « inconnu », jamais ses chiffres', () => {
  it('l’identifiant du lot est fourni directement : refus, aucune lecture de chiffres', async () => {
    const r = reader()
    const out = await ask(r, { lotId: 'lot-other' })
    expect(out).toEqual({ kind: 'lot_unknown', lotId: 'lot-other' })
    expect(r.calls).toEqual([])
    expect(JSON.stringify(out)).not.toMatch(/launched|counters/)
  })

  it('un lot inexistant est indistinguable d’un lot d’un autre espace', async () => {
    expect(await ask(reader(), { lotId: 'lot-fantome' })).toEqual({ kind: 'lot_unknown', lotId: 'lot-fantome' })
  })

  it('un lot de MON espace mais hors de mon périmètre de portefeuille est refusé aussi', async () => {
    const out = await ask(reader(), {
      lotId: 'lot-mine',
      businessUnitScope: { businessUnitIds: ['bu-2'], includeUnassigned: true },
    })
    expect(out.kind).toBe('lot_unknown')
  })

  it('un lot de mon espace et de mon périmètre est lu (le témoin : la garde ne refuse pas tout)', async () => {
    const r = reader()
    const out = await ask(r, {
      lotId: 'lot-mine',
      businessUnitScope: { businessUnitIds: ['bu-1'], includeUnassigned: true },
    })
    expect(out.kind).toBe('progress')
    expect(r.calls).toEqual([`analysis:lot-mine:${WS}`])
  })

  it('isLotInScope : périmètre vide = seulement le non rattaché, jamais « tout »', () => {
    const lot = (ids: (string | null)[]): AnalysisLotRef => ({ id: 'l', workspaceId: WS, itemBusinessUnitIds: ids })
    const none = { businessUnitIds: [], includeUnassigned: true } as const
    expect(isLotInScope(lot(['bu-1']), WS, none)).toBe(false)
    expect(isLotInScope(lot([null]), WS, none)).toBe(true)
    expect(isLotInScope(lot(['bu-1']), WS, null)).toBe(true)
    expect(isLotInScope(lot(['bu-1']), OTHER_WS, null)).toBe(false)
  })
})

describe('#4611.5 / #4611.7 — ce qui n’a pas pu être mesuré se NOMME, jamais « 0 »', () => {
  it('une famille dont la lecture échoue rend quatre compteurs NOMMÉS non mesurés, jamais 0', async () => {
    const out = await ask(
      reader({
        imports: async () => {
          throw new Error('connection timeout')
        },
      }),
    )
    if (out.kind !== 'progress') throw new Error('progress attendu')
    const imports = out.families.find(f => f.family === 'import')
    expect(imports?.counters.launched).toEqual({
      measured: false,
      reason: 'read_failed',
      reasonLabel: 'la lecture a échoué',
    })
    expect(imports?.counters.running).toEqual({
      measured: false,
      reason: 'read_failed',
      reasonLabel: 'la lecture a échoué',
    })
    expect(JSON.stringify(imports)).not.toContain('"value":0')
    // …et les autres familles restent mesurées : une panne ne contamine pas la suite.
    expect(out.families.find(f => f.family === 'analysis')?.counters.launched).toEqual({ measured: true, value: 4 })
  })

  it('un compteur que le lecteur n’a pas pu compter reste nommé, même quand les trois autres le sont', async () => {
    const out = await ask(reader({ analysis: async () => measured({ running: null }) }))
    if (out.kind !== 'progress') throw new Error('progress attendu')
    const analysis = out.families.find(f => f.family === 'analysis')
    expect(analysis?.counters.running).toEqual({
      measured: false,
      reason: 'read_failed',
      reasonLabel: 'la lecture a échoué',
    })
    expect(analysis?.counters.launched).toEqual({ measured: true, value: 4 })
  })

  it('#4611.4 — « lancées − rendues » ne fabrique jamais « en cours »', async () => {
    const out = await ask(reader({ analysis: async () => measured({ launched: 15, done: 10, running: null }) }))
    if (out.kind !== 'progress') throw new Error('progress attendu')
    expect(out.families[0]?.counters.running.measured).toBe(false)
  })
})

describe('#4611.1 / .2 / .6 — une seule forme, sept familles, des échecs nommés', () => {
  it('rend les sept familles dans l’ordre, avec les mêmes quatre compteurs', async () => {
    const out = await ask(reader())
    if (out.kind !== 'progress') throw new Error('progress attendu')
    expect(out.families.map(f => f.family)).toEqual([
      'analysis',
      'import',
      'enrichment',
      'crm_sync',
      'catch_up',
      'laura_job',
      'chat_research',
    ])
    for (const family of out.families)
      expect(Object.keys(family.counters)).toEqual(['launched', 'done', 'failed', 'running'])
  })

  it('les rattrapages n’ont aucun journal par espace : NOMMÉS non mesurés, jamais zéro', async () => {
    const out = await ask(reader())
    if (out.kind !== 'progress') throw new Error('progress attendu')
    const catchUp = out.families.find(f => f.family === 'catch_up')
    expect(catchUp?.counters.launched).toEqual({
      measured: false,
      reason: 'no_run_ledger',
      reasonLabel: 'aucun journal par espace ne tient ce suivi',
    })
    expect(catchUp?.since).toBeNull()
  })

  it('un lot en erreur garde sa raison telle que l’amont l’a donnée', async () => {
    const failure: WorkFailure = { label: 'Thales', reason: 'launch_error', at: '2026-10-28T08:00:00.000Z' }
    const out = await ask(reader({ analysis: async () => measured({}, [failure]) }))
    if (out.kind !== 'progress') throw new Error('progress attendu')
    expect(out.families[0]?.failures).toEqual([failure])
  })

  it('la fenêtre et l’heure de lecture voyagent avec les chiffres', async () => {
    const out = await ask(reader())
    if (out.kind !== 'progress') throw new Error('progress attendu')
    expect(out.readAt).toBe(NOW.toISOString())
    expect(out.windowDays).toBe(7)
  })
})

describe('#4611 « tout le travail en cours » / #4967 — jobs de Laura et recherches de conversation (lot L6)', () => {
  const chatTurns = (running: number) => ({
    measure: jest.fn((userId: string) => ({
      running: userId === 'u-1' ? running : 0,
      since: running ? '2026-10-28T09:58:00.000Z' : null,
      lastActivityAt: running ? '2026-10-28T09:58:00.000Z' : null,
    })),
  })
  const askWith = (r: WorkProgressReader, turns?: ReturnType<typeof chatTurns>) =>
    new WorkProgressService(r, () => NOW, turns).read({ workspaceId: WS, userId: 'u-1', businessUnitScope: null })

  it('les jobs de Laura sont lus par leur propre lecture, bornée à l’appelant', async () => {
    const lauraJobs = jest.fn(async () => measured({ launched: 2, done: 1, failed: 0, running: 1 }))
    const out = await askWith(reader({ lauraJobs }))
    if (out.kind !== 'progress') throw new Error('progress attendu')
    expect(lauraJobs).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WS, userId: 'u-1' }))
    expect(out.families.find(f => f.family === 'laura_job')?.counters.running).toEqual({ measured: true, value: 1 })
  })

  it('une recherche qui tourne côté serveur est MESURÉE « en cours », depuis son départ', async () => {
    const turns = chatTurns(1)
    const out = await askWith(reader(), turns)
    if (out.kind !== 'progress') throw new Error('progress attendu')
    const research = out.families.find(f => f.family === 'chat_research')
    expect(turns.measure).toHaveBeenCalledWith('u-1')
    expect(research?.counters.running).toEqual({ measured: true, value: 1 })
    expect(research?.since).toBe('2026-10-28T09:58:00.000Z')
  })

  it('NON — lancées, rendues, en erreur ne sont pas tenues : NOMMÉES non mesurées, jamais « 0 »', async () => {
    const out = await askWith(reader(), chatTurns(0))
    if (out.kind !== 'progress') throw new Error('progress attendu')
    const research = out.families.find(f => f.family === 'chat_research')
    expect(research?.counters.running).toEqual({ measured: true, value: 0 })
    for (const counter of ['launched', 'done', 'failed'] as const)
      expect(research?.counters[counter]).toMatchObject({ measured: false, reason: 'no_run_ledger' })
  })

  it('NON — sans registre branché, même « en cours » n’est pas un 0', async () => {
    const out = await askWith(reader())
    if (out.kind !== 'progress') throw new Error('progress attendu')
    expect(out.families.find(f => f.family === 'chat_research')?.counters.running.measured).toBe(false)
  })
})

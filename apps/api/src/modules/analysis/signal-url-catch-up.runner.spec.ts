import type { EntityManager } from 'typeorm'
import {
  runSignalUrlCatchUp,
  formatSignalUrlCatchUpReport,
  sqlSignalUrlCatchUpPort,
  type SignalUrlCatchUpPort,
} from './signal-url-catch-up.runner'

const signals = (url?: string) => [
  { signal: 'Dev Java', type: 'recrutement', date: '2026-10-01', ...(url ? { url } : {}) },
]
const jobs = [{ title: 'Dev Java', date: '2026-10-01', url: 'https://emploi.example/1' }]

function port(rows: Array<{ id: string; workspace_id: string | null; recent_signals: unknown; jobs: unknown }>) {
  const saved: Array<{ id: string; signals: unknown }> = []
  const impl: SignalUrlCatchUpPort = {
    async listPage(afterId, pageSize) {
      return rows.filter(r => !afterId || r.id > afterId).slice(0, pageSize)
    },
    async save(id, _previous, next) {
      saved.push({ id, signals: next })
      return true
    },
  }
  return { impl, saved }
}

describe('runSignalUrlCatchUp', () => {
  const rows = [
    { id: 'a1', workspace_id: 'w1', recent_signals: signals(), jobs },
    { id: 'a2', workspace_id: 'w1', recent_signals: signals(), jobs },
    { id: 'a3', workspace_id: 'w2', recent_signals: signals('https://deja.example'), jobs },
    { id: 'a4', workspace_id: 'w2', recent_signals: signals(), jobs: [] },
  ]

  it('SIMULATION par défaut : compte par espace, n’écrit rien', async () => {
    const { impl, saved } = port(rows)
    const report = await runSignalUrlCatchUp({ port: impl, apply: false, pageSize: 2 })
    expect(saved).toEqual([])
    expect(report).toMatchObject({ mode: 'simulation', accounts: 2, signals: 2, written: 0, networkCalls: 0 })
    expect(report.byWorkspace).toEqual({ w1: 2 })
  })

  it('--appliquer écrit les comptes patchés, --limite borne le lot', async () => {
    const { impl, saved } = port(rows)
    const report = await runSignalUrlCatchUp({ port: impl, apply: true, limit: 1, pageSize: 2 })
    expect(saved.map(s => s.id)).toEqual(['a1'])
    expect(report).toMatchObject({ mode: 'applique', written: 1 })
  })

  it('--workspace ne vise que cet espace', async () => {
    const { impl } = port(rows)
    const report = await runSignalUrlCatchUp({ port: impl, apply: false, workspaceId: 'w2' })
    expect(report.accounts).toBe(0)
  })

  it('un compte réécrit entre-temps (port renvoie false) n’est pas compté écrit', async () => {
    const { impl } = port(rows)
    impl.save = async () => false
    const report = await runSignalUrlCatchUp({ port: impl, apply: true })
    expect(report.written).toBe(0)
    expect(report.skippedConcurrent).toBe(2)
  })

  it('le rapport dit le coût : zéro appel réseau, zéro crédit', async () => {
    const { impl } = port(rows)
    const text = formatSignalUrlCatchUpReport(await runSignalUrlCatchUp({ port: impl, apply: false }))
    expect(text).toContain('SIMULATION')
    expect(text).toContain('Appels réseau : 0')
    expect(text).toContain('Crédits débités : 0')
  })
})

describe('sqlSignalUrlCatchUpPort.save (intégration M — forme pg de UPDATE … RETURNING)', () => {
  const save = (result: unknown) =>
    sqlSignalUrlCatchUpPort({ query: jest.fn().mockResolvedValue(result) } as unknown as EntityManager).save(
      'a1',
      [],
      [],
      undefined,
    )

  it('garde optimiste perdue : [[], 0] (forme pg) n’est PAS une écriture', async () => {
    await expect(save([[], 0])).resolves.toBe(false)
  })

  it('ligne réécrite : [[{ id }], 1] (forme pg) est une écriture', async () => {
    await expect(save([[{ id: 'a1' }], 1])).resolves.toBe(true)
  })
})

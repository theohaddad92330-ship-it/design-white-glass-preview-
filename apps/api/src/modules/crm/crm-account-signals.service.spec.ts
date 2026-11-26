import { CrmAccountSignalsService } from './crm-account-signals.service'

type QueryStub = jest.Mock<Promise<unknown[]>, [string, unknown[]?]>

function build(rows: unknown[]) {
  const query: QueryStub = jest.fn(async (_sql: string, _params?: unknown[]) => rows)
  return { service: new CrmAccountSignalsService({ manager: { query } } as never), query }
}

describe('#3918.b — CrmAccountSignalsService.forAccount (le lecteur des signaux CRM de la veille)', () => {
  it('lit le registre canonique PAR COMPTE et PAR ESPACE, sur les seuls trois types CRM', async () => {
    const { service, query } = build([])
    await service.forAccount('ws-1', 'acc-1')
    const [sql, params] = query.mock.calls[0] ?? ['', []]
    expect(sql).toContain('FROM canonical_trigger_events')
    expect(sql).toContain("payload->>'accountId'")
    expect(sql).toContain("acc.status <> 'deleted'")
    expect(params).toEqual(['ws-1', 'acc-1', ['affaire_perdue', 'affaire_dormante', 'affaire_renouvellement']])
  })

  it('#3915.2 — un événement résolu ou périmé (colonnes du registre) ne ressort jamais ; une ligne sans colonnes reste lue', async () => {
    const { service, query } = build([])
    await service.forAccount('ws-1', 'acc-1')
    const sql = String(query.mock.calls[0]?.[0]).replace(/\s+/g, ' ')
    expect(sql).toContain("e.status IS DISTINCT FROM 'resolved'")
    expect(sql).toContain('(e.expires_at IS NULL OR e.expires_at > now())')
  })

  it('rend chaque signal dans la forme que la veille lit déjà (RecentSignal) : le fait, sa date, « Votre CRM »', async () => {
    const { service } = build([
      {
        kind: 'affaire_perdue',
        evidence: 'TMA AXA : affaire perdue il y a 3 mois.',
        occurred_at: new Date('2026-07-01T00:00:00.000Z'),
      },
    ])
    expect(await service.forAccount('ws-1', 'acc-1')).toEqual([
      {
        id: null,
        signal: 'TMA AXA : affaire perdue il y a 3 mois.',
        // On nomme ce que l'espace a branché par sa CAPACITÉ, jamais l'éditeur (crm-presence.ts).
        source: 'Votre CRM',
        source_ref: null,
        url: null,
        source_kind: null,
        type: 'affaire_perdue',
        date: '2026-07-01',
        sales_implication: null,
        impact: null,
        freshness: 'current',
      },
    ])
  })

  it('aucun signal CRM rattaché : une liste vide, jamais un signal de remplissage', async () => {
    const { service } = build([])
    expect(await service.forAccount('ws-1', 'acc-1')).toEqual([])
  })
})

describe('#3918.b — GET /crm/accounts/:accountId/signals', () => {
  it("lit les signaux du compte DANS l'espace actif de l'appelant", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CrmController } = require('./crm.controller') as typeof import('./crm.controller')
    const forAccount = jest.fn().mockResolvedValue([])
    const workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
    const isConnected = jest.fn().mockResolvedValue(false)
    const controller = new CrmController(
      { isConnected } as never,
      {} as never,
      {} as never,
      {} as never,
      workspace as never,
      {} as never,
      { forAccount, linkedDealCount: jest.fn().mockResolvedValue(0) } as never,
      {} as never,
      {} as never,
      {} as never,
    )
    const result = await controller.accountSignals({ userId: 'u-1' } as never, 'acc-1')
    expect(forAccount).toHaveBeenCalledWith('ws-1', 'acc-1')
    // GA-10 — the empty list says whether a CRM was there to read.
    expect(result).toEqual({ items: [], crm_connected: false, linked_deals: 0 })
    expect(isConnected).toHaveBeenCalledWith('u-1')
  })
})

describe('#3918.2 (r40) — CrmAccountSignalsService.linkedDealCount', () => {
  it("compte les affaires rattachées à CE compte dans CET espace, et rend zéro quand il n'y en a aucune", async () => {
    const { service, query } = build([{ n: '0' }])
    expect(await service.linkedDealCount('ws-1', 'acc-1')).toBe(0)
    const [sql, params] = query.mock.calls[0] ?? ['', []]
    expect(sql).toContain('FROM crm_deal_facts')
    expect(sql).toContain('workspace_id = $1')
    expect(sql).toContain('account_id = $2')
    expect(params).toEqual(['ws-1', 'acc-1'])
  })

  it('rend le nombre lu', async () => {
    const { service } = build([{ n: '4' }])
    expect(await service.linkedDealCount('ws-1', 'acc-1')).toBe(4)
  })
})

describe('lot 762 P5 — historyForAccount : l’historique SANS le filtre d’expiration', () => {
  it('ne filtre NI sur expires_at, NI sur le statut résolu, NI ne plafonne à 20 — et rend statut + dates', async () => {
    const { service, query } = build([])
    await service.historyForAccount('ws-1', 'acc-1')
    const sql = String(query.mock.calls[0]?.[0]).replace(/\s+/g, ' ')
    expect(sql).not.toContain('expires_at >')
    expect(sql).not.toContain("'resolved'")
    expect(sql).toContain('e.status, e.expires_at')
  })

  it('rend une ligne échue/résolue avec son statut et son échéance, plus de 20 lignes', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      kind: 'affaire_perdue',
      evidence: `Affaire ${i}`,
      occurred_at: new Date(Date.UTC(2023, 0, 1 + i)),
      status: i === 0 ? 'resolved' : null,
      expires_at: i === 0 ? new Date('2023-02-01T00:00:00Z') : null,
    }))
    const { service } = build(rows)
    const out = await service.historyForAccount('ws-1', 'acc-1')
    expect(out).toHaveLength(25)
    const resolved = out.find(l => l.evidence === 'Affaire 0')
    expect(resolved).toMatchObject({ status: 'resolved', expires_at: '2023-02-01T00:00:00.000Z', date: '2023-01-01' })
    expect(out.find(l => l.evidence === 'Affaire 1')).toMatchObject({ status: null, expires_at: null })
  })

  it('la lecture courante forAccount reste filtrée (inchangée)', async () => {
    const { service, query } = build([])
    await service.forAccount('ws-1', 'acc-1')
    expect(String(query.mock.calls[0]?.[0])).toContain('e.expires_at > now()')
  })
})

import { Logger } from '@nestjs/common'
import { RefreshRefundSweepService } from './refresh-refund-sweep.service'
import type { RefreshRefundOutcome } from './refresh-refund.service'

// #2650.2 — l'APPELANT nocturne de `RefreshRefundService.run`. Avant ce
// service, la seule porte du remboursement était `POST
// internal/admin/credits/refresh-refunds`, à la main : un correctif inerte
// tant que personne ne le déclenche.
const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '22222222-2222-4222-8222-222222222222'

/**
 * Doublure du service de remboursement : elle IMITE son idempotence réelle
 * (un débit remboursé une fois ne l'est plus jamais) au lieu d'un simple
 * `jest.fn` — c'est ce qui permet de PROUVER l'idempotence du balayage en le
 * REJOUANT, pas seulement de vérifier qu'il a été appelé.
 */
class FakeRefreshRefundService {
  readonly calls: Array<{ workspaceId: string; opts: { dryRun: boolean; actor: string } }> = []
  private readonly alreadyRun = new Set<string>()
  /** L'espace pour lequel `run` doit échouer — simule un timeout / une base indisponible. */
  failingWorkspaceId: string | null = null

  async run(workspaceId: string, opts: { dryRun: boolean; actor: string }): Promise<RefreshRefundOutcome> {
    this.calls.push({ workspaceId, opts })
    if (workspaceId === this.failingWorkspaceId) throw new Error('timeout simulé')

    if (this.alreadyRun.has(workspaceId)) {
      return { workspaceId, dryRun: opts.dryRun, refunds: [], totalCredits: 0, alreadyRefunded: ['d1'], skipped: [] }
    }
    this.alreadyRun.add(workspaceId)
    return {
      workspaceId,
      dryRun: opts.dryRun,
      refunds: [
        {
          debitId: 'd1',
          accountId: 'a1',
          dimension: 'signals',
          credits: 3,
          debitedAt: '2026-09-20T08:00:00.000Z',
          windowOpenedBy: 'd0',
          windowOpenedAt: '2026-09-20T07:00:00.000Z',
          refundLedgerId: 'r1',
        },
      ],
      totalCredits: 3,
      alreadyRefunded: [],
      skipped: [],
    }
  }
}

function makeDataSource(rows: Array<{ workspace_id: string }>) {
  return { query: jest.fn().mockResolvedValue(rows) }
}

describe('RefreshRefundSweepService (#2650.2)', () => {
  let refunds: FakeRefreshRefundService
  let logSpy: jest.SpyInstance
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    refunds = new FakeRefreshRefundService()
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => jest.restoreAllMocks())

  it('appelle `run` en mode RÉEL (dryRun: false), PAR ESPACE — jamais un lot agrégé', async () => {
    const dataSource = makeDataSource([{ workspace_id: WS }, { workspace_id: OTHER_WS }])
    const service = new RefreshRefundSweepService(dataSource as never, refunds as never)

    const report = await service.sweep()

    expect(refunds.calls).toEqual([
      { workspaceId: WS, opts: { dryRun: false, actor: 'cron' } },
      { workspaceId: OTHER_WS, opts: { dryRun: false, actor: 'cron' } },
    ])
    expect(report).toEqual({ workspacesExamined: 2, workspacesRefunded: 2, workspacesFailed: 0 })
    // GA-43 : chaque ligne de journal ne porte qu'UN espace — jamais un total combiné.
    for (const [message] of logSpy.mock.calls) {
      const workspacesNamed = [WS, OTHER_WS].filter(id => String(message).includes(id))
      expect(workspacesNamed.length).toBeLessThanOrEqual(1)
    }
  })

  it('IDEMPOTENT — rejoué la nuit suivante, aucun débit n’est remboursé deux fois', async () => {
    const dataSource = makeDataSource([{ workspace_id: WS }])
    const service = new RefreshRefundSweepService(dataSource as never, refunds as never)

    const first = await service.sweep()
    const second = await service.sweep()

    expect(first.workspacesRefunded).toBe(1)
    // Même débit, même espace : la seconde nuit ne trouve plus rien À rembourser.
    expect(second.workspacesRefunded).toBe(0)
    expect(refunds.calls).toHaveLength(2)
  })

  it('un espace en échec (timeout, base indisponible) est SAUTÉ — jamais de remboursement deviné', async () => {
    refunds.failingWorkspaceId = WS
    const dataSource = makeDataSource([{ workspace_id: WS }, { workspace_id: OTHER_WS }])
    const service = new RefreshRefundSweepService(dataSource as never, refunds as never)

    const report = await service.sweep()

    expect(report).toEqual({ workspacesExamined: 2, workspacesRefunded: 1, workspacesFailed: 1 })
    // L'autre espace n'est pas bloqué par l'échec du premier.
    expect(refunds.calls.map(c => c.workspaceId)).toEqual([WS, OTHER_WS])
    expect(errorSpy).toHaveBeenCalled()
  })

  it('sans espace à examiner, ne journalise rien et ne plante pas', async () => {
    const dataSource = makeDataSource([])
    const service = new RefreshRefundSweepService(dataSource as never, refunds as never)

    const report = await service.sweep()

    expect(report).toEqual({ workspacesExamined: 0, workspacesRefunded: 0, workspacesFailed: 0 })
    expect(refunds.calls).toEqual([])
  })
})

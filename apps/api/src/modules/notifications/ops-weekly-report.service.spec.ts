import {
  OpsWeeklyReportService,
  type OpsWeeklyReportMailer,
  type UnderSingletonLock,
} from './ops-weekly-report.service'

/**
 * Le SERVICE (#1648) — pas le calcul de l'email (voir `ops-weekly-report.spec.ts`)
 * mais son orchestration : le no-op strict sans destinataire, l'envoi
 * INCONDITIONNEL une fois configuré, et le passage par le verrou.
 */

function repo<T extends Record<string, unknown>>(rows: T[] = []) {
  return {
    find: jest.fn(async (options?: { order?: Record<string, 'ASC' | 'DESC'>; take?: number }) => {
      const out = [...rows]
      const [field, direction] = Object.entries(options?.order ?? {})[0] ?? []
      if (field) {
        out.sort((a, b) => {
          const av = String(a[field as keyof T])
          const bv = String(b[field as keyof T])
          return direction === 'DESC' ? (av < bv ? 1 : -1) : av < bv ? -1 : 1
        })
      }
      return options?.take ? out.slice(0, options.take) : out
    }),
  }
}

function build(
  options: {
    snapshots?: Record<string, unknown>[]
    accounts?: Record<string, unknown>[]
    runs?: Record<string, unknown>[]
  } = {},
) {
  const send = jest.fn<ReturnType<OpsWeeklyReportMailer['send']>, Parameters<OpsWeeklyReportMailer['send']>>(
    async () => undefined,
  )
  const mailer: OpsWeeklyReportMailer = { send }
  const underLock: UnderSingletonLock = jest.fn(async (_name, run) => run())
  const accounts = repo(options.accounts ?? [])
  const runs = repo(options.runs ?? [])
  const snapshots = repo(options.snapshots ?? [])

  const service = new OpsWeeklyReportService(accounts as never, runs as never, snapshots as never, mailer, underLock)
  return { service, send, underLock, accounts, runs, snapshots }
}

describe('OpsWeeklyReportService — le no-op strict (#1648)', () => {
  const ENV = process.env

  afterEach(() => {
    process.env = { ...ENV }
  })

  it('sans OPS_WEEKLY_REPORT_RECIPIENTS, aucun envoi, aucune lecture de base — no-op STRICT', async () => {
    process.env = { ...ENV, OPS_WEEKLY_REPORT_RECIPIENTS: '' }
    const { service, send, accounts, runs, snapshots } = build()

    const résultat = await service.run(new Date('2026-09-08T07:00:00Z'))

    expect(résultat).toBe('no_recipients')
    expect(send).not.toHaveBeenCalled()
    expect(accounts.find).not.toHaveBeenCalled()
    expect(runs.find).not.toHaveBeenCalled()
    expect(snapshots.find).not.toHaveBeenCalled()
  })

  it('OPS_WEEKLY_REPORT_RECIPIENTS non posée du tout (undefined) → même no-op', async () => {
    process.env = { ...ENV }
    delete process.env['OPS_WEEKLY_REPORT_RECIPIENTS']
    const { service, send } = build()

    expect(await service.run(new Date('2026-09-08T07:00:00Z'))).toBe('no_recipients')
    expect(send).not.toHaveBeenCalled()
  })

  it('configurée avec deux adresses → un envoi PAR adresse, jamais codées en dur', async () => {
    process.env = { ...ENV, OPS_WEEKLY_REPORT_RECIPIENTS: 'ops1@bellum-it.com, ops2@bellum-it.com' }
    const { service, send } = build({
      snapshots: [
        {
          month: '2026-08',
          mrr_end_cents: 1_248_000,
          customers_end: 16,
          mrr_new_cents: 90_000,
          mrr_expansion_cents: 58_000,
          mrr_contraction_cents: 0,
          mrr_churned_cents: 20_000,
        },
      ],
    })

    const résultat = await service.run(new Date('2026-09-08T07:00:00Z'))

    expect(résultat).toBe('sent')
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls.map(call => call[0].to)).toEqual(['ops1@bellum-it.com', 'ops2@bellum-it.com'])
  })

  it('ENVOYÉ MÊME SI TOUT VA BIEN — aucune activité cette semaine n’empêche pas l’envoi', async () => {
    process.env = { ...ENV, OPS_WEEKLY_REPORT_RECIPIENTS: 'ops@bellum-it.com' }
    const { service, send } = build()

    expect(await service.run(new Date('2026-09-08T07:00:00Z'))).toBe('sent')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('passe par le verrou d’exécution unique — jamais deux répliques qui envoient chacune leur rapport', async () => {
    process.env = { ...ENV, OPS_WEEKLY_REPORT_RECIPIENTS: 'ops@bellum-it.com' }
    const { service, underLock } = build()

    await service.runOpsWeeklyReport()

    expect(underLock).toHaveBeenCalledWith('ops-weekly-report', expect.any(Function))
  })
})

import { AdminCreditConsumptionService } from './admin-credit-consumption.service'

// #4467 — le service assemble espaces, membres, abonnement du propriétaire et
// grand livre ; le calcul est gardé par credit-consumption.spec.ts.

const NOW = new Date('2026-10-22T10:00:00Z')

function qb(result: { many?: unknown[]; rawMany?: unknown[] }): unknown {
  const self: Record<string, unknown> = {}
  for (const nom of ['select', 'addSelect', 'where', 'andWhere', 'orderBy', 'limit', 'groupBy', 'addGroupBy']) {
    self[nom] = (): unknown => self
  }
  self['getMany'] = async (): Promise<unknown[]> => result.many ?? []
  self['getRawMany'] = async (): Promise<unknown[]> => result.rawMany ?? []
  return self
}

function repo(result: { many?: unknown[]; rawMany?: unknown[] } = {}, find: unknown[] = []): never {
  return { createQueryBuilder: (): unknown => qb(result), find: async (): Promise<unknown[]> => find } as never
}

describe('AdminCreditConsumptionService.report', () => {
  it('rend un rapport vide quand aucun espace ne correspond', async () => {
    const service = new AdminCreditConsumptionService(repo(), repo(), repo(), repo(), repo())
    await expect(service.report({ now: NOW })).resolves.toEqual({
      windowDays: 30,
      workspaces: [],
      users: [],
      exhausted: [],
    })
  })

  it('assemble solde du pool, consommation par membre et comptes épuisés', async () => {
    const workspace = { id: 'w1', name: 'Acme', owner_user_id: 'u1', created_at: NOW }
    const sub = {
      user_id: 'u1',
      plan: 'growth',
      accounts_limit: 10,
      accounts_used: 10,
      topup_analyses: 0,
      rollover_credits: 0,
      rollover_expires_at: null,
      period_start: new Date('2026-10-05T00:00:00Z'),
    }
    const service = new AdminCreditConsumptionService(
      repo({ many: [workspace] }),
      repo({ rawMany: [{ workspaceId: 'w1', userId: 'u1' }] }),
      repo({}, [sub]),
      repo({}, [{ user_id: 'u1', email: 'o@acme.fr' }]),
      repo({ rawMany: [{ workspaceId: 'w1', actorUserId: 'u1', consumed: '10' }] }),
    )
    const report = await service.report({ now: NOW })
    expect(report.workspaces[0]).toMatchObject({ remaining: 0, exhausted: true, consumed: 10 })
    expect(report.users[0]).toMatchObject({ email: 'o@acme.fr', consumed: 10 })
    expect(report.exhausted).toHaveLength(1)
  })

  it('borne la fenêtre demandée', async () => {
    const service = new AdminCreditConsumptionService(repo(), repo(), repo(), repo(), repo())
    expect((await service.report({ now: NOW, days: 9999 })).windowDays).toBe(365)
    expect((await service.report({ now: NOW, days: 0 })).windowDays).toBe(1)
  })
})

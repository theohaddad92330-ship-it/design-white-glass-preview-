import { AdminUsersService } from './admin-users.service'
import { TeamKpisService } from '../analytics/team-kpis.service'
import { PlanCatalogService } from '../credits/plan-catalog.service'
import { PlanDefinitionEntity } from '../../database/entities/plan-definition.entity'
import { ProductEventEntity } from '../../database/entities/product-event.entity'
import { createMockRepository } from '../../database/test-utils'

/**
 * #4423.2 — la fiche utilisateur (« lancées / terminées / suivies ») et la vue ESN (« comptes actifs ») comptent
 * les MÊMES comptes avec la MÊME définition (`accounts/account-counts.ts`). On nourrit les deux écrans avec UN
 * jeu de comptes et on exige l'égalité, chiffre par chiffre — c'est ce que deux recomptages séparés ne tenaient pas.
 */
const COMPTES = [
  // 5 terminés dont un archivé, 276 importés non terminés dont deux archivés, un échec.
  ...Array.from({ length: 4 }, () => ({ status: 'completed', commercial_status: 'watching' })),
  { status: 'completed', commercial_status: 'archived' },
  ...Array.from({ length: 274 }, () => ({ status: 'imported', commercial_status: 'inbox' })),
  ...Array.from({ length: 2 }, () => ({ status: 'imported', commercial_status: 'archived' })),
  { status: 'error', commercial_status: 'inbox' },
]

/** Le GROUP BY que lit la vue ESN, calculé depuis le même jeu. */
function cellsOf(rows: typeof COMPTES, userId: string) {
  const byKey = new Map<string, { userId: string; status: string; commercialStatus: string; count: number }>()
  for (const row of rows) {
    const key = `${row.status}|${row.commercial_status}`
    const cell = byKey.get(key) ?? { userId, status: row.status, commercialStatus: row.commercial_status, count: 0 }
    cell.count += 1
    byKey.set(key, cell)
  }
  return [...byKey.values()]
}

async function userView() {
  const accounts = createMockRepository<never>()
  accounts.count.mockResolvedValue(COMPTES.length)
  accounts.find.mockResolvedValue(COMPTES.map((c, i) => ({ company_name: `C${i}`, ...c })) as never)
  const profiles = createMockRepository<never>()
  profiles.findOne.mockResolvedValue({ user_id: 'u1', email: 'a@b.co', first_name: 'Ada', last_name: 'L' } as never)
  const service = new AdminUsersService(
    profiles as never,
    createMockRepository<never>() as never,
    createMockRepository<never>() as never,
    createMockRepository<never>() as never,
    accounts as never,
    createMockRepository<never>() as never,
    {
      getClient: () => ({
        auth: { admin: { getUserById: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) } },
      }),
    } as never,
    new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never),
    { get: (_k: string, f?: string) => f, getOrThrow: () => 's' } as never,
    createMockRepository<never>() as never,
    createMockRepository<never>() as never,
  )
  const detail = await service.getUserDetail('u1', null)
  return detail.accountsBreakdown
}

async function esnView() {
  const repo = createMockRepository<ProductEventEntity>()
  repo.manager.query.mockImplementation((sql: string) => {
    if (sql.includes('q:workspace')) return Promise.resolve([{ id: 'ws-1', name: 'exFabrica' }])
    if (sql.includes('q:members')) {
      return Promise.resolve([{ userId: 'u1', role: 'owner', firstName: 'Ada', lastName: 'L', email: 'a@b.co' }])
    }
    if (sql.includes('q:accounts_member')) return Promise.resolve(cellsOf(COMPTES, 'u1'))
    return Promise.resolve([])
  })
  const detail = await new TeamKpisService(repo as never).getTeamDetail('ws-1', 30)
  return detail.members[0]
}

describe('#4423.2 — une seule définition des chiffres « comptes »', () => {
  it('fiche utilisateur et vue ESN rendent les mêmes lancés / terminés / actifs / suivis', async () => {
    const user = await userView()
    const esn = await esnView()
    expect(user).toMatchObject({ total: 282, completed: 5, active: 279, followed: 4 })
    expect(esn).toMatchObject({ accountsLaunched: 282, accountsCompleted: 5, activeAccounts: 279, followedAccounts: 4 })
    expect([esn?.accountsLaunched, esn?.accountsCompleted, esn?.activeAccounts, esn?.followedAccounts]).toEqual([
      user?.total,
      user?.completed,
      user?.active,
      user?.followed,
    ])
  })

  it('« actifs » n’est pas « lancés » : l’écart, ce sont les archivés', async () => {
    const user = await userView()
    expect((user?.total ?? 0) - (user?.active ?? 0)).toBe(3)
  })
})

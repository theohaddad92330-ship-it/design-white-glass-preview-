import { CRM_LINKED_ACCOUNT_PREDICATE, IMPORTED_ACCOUNT_PREDICATE } from './account-crm-linked'
import { AccountsService } from './accounts.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/** #4526.2 / #4526.5 — le filtre « Mon CRM » et son compteur, sur le même faux dépôt clonant. */
type Fake = {
  service: AccountsService
  firstClonePredicate: string | null
  favoriteUserIdCalls: unknown[]
  predicates: string[]
  wheres: Array<{ sql: string; params: unknown }>
}

function createFake(): Fake {
  let firstClonePredicate: string | null | undefined
  const favoriteUserIdCalls: unknown[] = []
  const predicates: string[] = []
  const wheres: Array<{ sql: string; params: unknown }> = []

  const makeQb = (inherited: string | null) => {
    let own = inherited
    const qb = {
      where(sql: string, params?: unknown) {
        wheres.push({ sql, params })
        return qb
      },
      andWhere(sql: string) {
        predicates.push(sql)
        own = own === null ? sql : `${own} AND ${sql}`
        return qb
      },
      setParameter(key: string, value: unknown) {
        if (key === 'favoriteUserId') favoriteUserIdCalls.push(value)
        return qb
      },
      orderBy: () => qb,
      addOrderBy: () => qb,
      select: () => qb,
      offset: () => qb,
      limit: () => qb,
      clone() {
        const child = makeQb(own)
        if (firstClonePredicate === undefined) firstClonePredicate = own
        return child
      },
      async getCount() {
        return 0
      },
      async getRawMany() {
        return []
      },
    }
    return qb
  }

  const accounts = createMockRepository<AccountEntity>() as MockRepository<AccountEntity>
  accounts.createQueryBuilder = jest.fn(() => makeQb(null)) as never
  accounts.manager = { query: async () => [] } as never

  const service = new AccountsService(accounts as never, {} as never, {} as never, {} as never)
  return {
    service,
    get firstClonePredicate() {
      return firstClonePredicate ?? null
    },
    favoriteUserIdCalls,
    predicates,
    wheres,
  }
}

describe('#4526.2 — `crm: only` ajoute le prédicat Mon CRM, en AND de la requête existante', () => {
  it('pose le prédicat partagé', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { crm: 'only', offset: 0 }, null, undefined, undefined, 'user-a')
    expect(fake.firstClonePredicate).toContain(CRM_LINKED_ACCOUNT_PREDICATE)
  })

  it("sans `crm` (ou `all`), aucun prédicat CRM n'atteint la liste", async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { crm: 'all', offset: 0 }, null, undefined, undefined, 'user-a')
    expect(fake.firstClonePredicate ?? '').not.toContain('crm_deals')
  })
})

describe('#4526.5 — le compteur Mon CRM porte le MÊME prédicat que le filtre', () => {
  it('un clone de la requête de tête porte le prédicat', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { offset: 0 }, null, undefined, undefined, 'user-a')
    expect(fake.predicates.some(p => p.includes(CRM_LINKED_ACCOUNT_PREDICATE))).toBe(true)
  })
})

describe('#4597.1 — `imported: only` ajoute le prédicat « Importés », et son compteur porte le MÊME', () => {
  it('pose le prédicat partagé, et jamais celui du CRM', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace(
      'ws-1',
      { imported: 'only', offset: 0 },
      null,
      undefined,
      undefined,
      'user-a',
    )
    expect(fake.firstClonePredicate).toContain(IMPORTED_ACCOUNT_PREDICATE)
    expect(fake.firstClonePredicate).not.toContain(CRM_LINKED_ACCOUNT_PREDICATE)
  })

  it("sans `imported`, la liste n'est pas restreinte (un filtre AJOUTE une vue, il ne retire rien)", async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { offset: 0 }, null, undefined, undefined, 'user-a')
    expect(fake.firstClonePredicate ?? '').not.toContain('import_job_id')
  })

  it('le compteur de tête porte le prédicat', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { offset: 0 }, null, undefined, undefined, 'user-a')
    expect(fake.predicates.some(p => p.includes(IMPORTED_ACCOUNT_PREDICATE))).toBe(true)
  })
})

describe('#4597.3 — `importJob` isole les comptes créés par CET import, dans le seul espace', () => {
  const JOB = '33333333-3333-4333-8333-333333333333'

  it("pose l'égalité sur l'identifiant, jamais une date", async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace(
      'ws-1',
      { importJob: JOB, offset: 0 },
      null,
      undefined,
      undefined,
      'user-a',
    )
    expect(fake.firstClonePredicate).toContain('account.import_job_id = :importJob')
  })
})

describe('REFUS — les filtres « Mon CRM » et « Importés » n’ouvrent rien hors de l’espace de l’appelant (#4526 / #4597)', () => {
  it.each([
    ['sans filtre', { offset: 0 }],
    ['`crm: only`', { crm: 'only' as const, offset: 0 }],
    ['`imported: only`', { imported: 'only' as const, offset: 0 }],
    ['les deux cumulés', { crm: 'only' as const, imported: 'only' as const, offset: 0 }],
  ])(
    '%s : la requête reste bornée à `workspace_id` de l’appelant, jamais à celui d’un autre',
    async (_label, filters) => {
      const fake = createFake()
      await fake.service.findAccountsByWorkspace('ws-1', filters, null, undefined, undefined, 'user-a')
      const scoped = fake.wheres.filter(w => w.sql === 'account.workspace_id = :workspaceId')
      expect(scoped.length).toBeGreaterThan(0)
      for (const w of scoped) expect(w.params).toEqual({ workspaceId: 'ws-1' })
    },
  )
})

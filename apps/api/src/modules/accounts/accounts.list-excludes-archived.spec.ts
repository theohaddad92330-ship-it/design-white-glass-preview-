import { AccountsService } from './accounts.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #4053 (recette R15, 15/10) — « Annuler cet import » archive les comptes créés
 * (`status = 'archived'`), mais la liste /accounts (et sa recherche `q`) les
 * rendait encore : seul le filtre `lifecycle` excluait les archivés. Par
 * défaut, la liste ne montre plus un compte rangé ; seul un filtre « Archivés »
 * explicite (statut ou cycle) le ramène.
 */
function predicateFor(filters: Record<string, unknown>): Promise<string> {
  let firstClone: string | undefined
  const makeQb = (inherited: string | null) => {
    let own = inherited
    const qb = {
      where: () => qb,
      andWhere(sql: string) {
        own = own === null ? sql : `${own} AND ${sql}`
        return qb
      },
      orderBy: () => qb,
      addOrderBy: () => qb,
      select: () => qb,
      offset: () => qb,
      limit: () => qb,
      clone() {
        if (firstClone === undefined) firstClone = own ?? ''
        return makeQb(own)
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
  return service.findAccountsByWorkspace('ws-1', { offset: 0, ...filters }).then(() => firstClone ?? '')
}

describe('#4053 — la liste des comptes exclut les archivés par défaut', () => {
  it('sans filtre de cycle, les comptes archivés ne sont pas listés', async () => {
    expect(await predicateFor({})).toContain("account.status <> 'archived'")
  })

  it('la recherche `q` exclut aussi les archivés', async () => {
    expect(await predicateFor({ q: 'Recette R15' })).toContain("account.status <> 'archived'")
  })

  it('le filtre « Archivés » explicite (statut) ramène les archivés', async () => {
    expect(await predicateFor({ status: 'archived' })).not.toContain("account.status <> 'archived'")
  })

  it('le cycle « archived » explicite ramène les archivés', async () => {
    expect(await predicateFor({ lifecycle: 'archived' })).not.toContain("account.status <> 'archived'")
  })
})

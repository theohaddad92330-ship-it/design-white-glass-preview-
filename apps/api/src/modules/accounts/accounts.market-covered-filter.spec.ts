import { AccountsService } from './accounts.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #1575.1 — LE CINQUIÈME COMPTEUR SE CLIQUE, ET SON CLIC FILTRE LE SERVEUR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FILTRE NE RESSEMBLE PAS AUX TROIS AUTRES
 * ─────────────────────────────────────────────────────────────────────────────
 * Les trois métriques décisionnelles de #1580 filtrent sur le prédicat SQL qui
 * les compte. La couverture mémoire marché n'EST PAS une expression SQL : c'est
 * l'arbitrage `resolveMarketCompany`, en TypeScript, sur les tables d'un AUTRE
 * module. Le service ne peut donc pas la calculer — il reçoit la liste
 * d'identifiants déjà résolue par le contrôleur, qui compose les deux.
 *
 * ⚠️ CE QUE CE FICHIER EMPÊCHE SURTOUT : qu'un appelant demande le filtre et
 * soit servi SANS. `findAccountsByWorkspace` a trois appelants (la liste, l'API
 * publique, le MCP) et deux d'entre eux ne savent rien de la mémoire marché.
 * Un `marketCovered` ignoré en silence rendrait TOUT le portefeuille sous un
 * libellé qui promet le contraire — « une porte plus étroite que son flux »,
 * mais à l'envers. Le service refuse donc de servir la demande qu'il ne sait
 * pas honorer, plutôt que de la laisser tomber.
 */

type Fake = {
  service: AccountsService
  /** Le prédicat accumulé sur le PREMIER clone — celui du total de pagination. */
  firstClonePredicate: string | null
  /** Les paramètres liés à la requête, pour lire la liste d'identifiants. */
  params: Record<string, unknown>
}

function createFake(): Fake {
  let firstClonePredicate: string | null | undefined
  const params: Record<string, unknown> = {}

  const makeQb = (inherited: string | null) => {
    let own = inherited
    const qb = {
      where: (_sql: string, bound?: Record<string, unknown>) => {
        Object.assign(params, bound ?? {})
        return qb
      },
      andWhere(sql: string, bound?: Record<string, unknown>) {
        own = own === null ? sql : `${own} AND ${sql}`
        Object.assign(params, bound ?? {})
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
    params,
  }
}

describe('#1575.1 — le filtre « avec des parcours observés »', () => {
  it('restreint la liste aux identifiants résolus par le contrôleur', async () => {
    const fake = createFake()

    await fake.service.findAccountsByWorkspace('ws-1', { marketCovered: 'covered', offset: 0 }, null, [
      'acc-1',
      'acc-3',
    ])

    expect(fake.firstClonePredicate).toContain('account.id IN (:...marketCoveredIds)')
    expect(fake.params.marketCoveredIds).toEqual(['acc-1', 'acc-3'])
  })

  /**
   * ⚠️ LE PIÈGE. Une liste VIDE n'est pas « pas de filtre » : elle dit « j'ai
   * lu, et aucun compte n'est couvert ». Un `IN ()` vide fait planter Postgres,
   * et retomber sur « aucun filtre » rendrait TOUT le portefeuille sous le
   * libellé « avec des parcours observés ». La réponse juste est zéro ligne.
   */
  it('rend zéro ligne — jamais tout le portefeuille — quand aucun compte n’est couvert', async () => {
    const fake = createFake()

    await fake.service.findAccountsByWorkspace('ws-1', { marketCovered: 'covered', offset: 0 }, null, [])

    expect(fake.firstClonePredicate).toContain('1 = 0')
    expect(fake.firstClonePredicate).not.toContain(':...marketCoveredIds')
  })

  it('refuse de servir la demande qu’il ne sait pas honorer, plutôt que de l’ignorer', async () => {
    const fake = createFake()

    await expect(fake.service.findAccountsByWorkspace('ws-1', { marketCovered: 'covered', offset: 0 })).rejects.toThrow(
      /marketCovered/,
    )
  })

  it('« all » ≡ pas de filtre, et n’exige donc aucune liste', async () => {
    const fake = createFake()

    await fake.service.findAccountsByWorkspace('ws-1', { marketCovered: 'all', offset: 0 })

    expect(fake.firstClonePredicate ?? '').not.toContain('marketCoveredIds')
    expect(fake.firstClonePredicate ?? '').not.toContain('1 = 0')
  })

  it('absent ≡ le comportement d’avant ce chantier', async () => {
    const fake = createFake()

    await fake.service.findAccountsByWorkspace('ws-1', { offset: 0 })

    expect(fake.firstClonePredicate ?? '').not.toContain('marketCoveredIds')
  })
})

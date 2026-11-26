import { AccountsService } from './accounts.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { ACCOUNT_HYGIENE_PREDICATES } from './account-hygiene.sql'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { ACCOUNT_STALE_AFTER_DAYS } from '@bellum/contracts'

/**
 * #1580 — LE BANDEAU DE TÊTE DEVIENT UN FILTRE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Les trois métriques DÉCISIONNELLES du bandeau (`withoutNextAction`,
 * `newSignals7d`, `accessClassAB`) se cliquent désormais, et le clic doit
 * filtrer la POPULATION SERVEUR complète — jamais seulement la page déjà
 * chargée, qui grandirait en scrollant (le défaut déjà payé sur `/contacts`).
 *
 * ⚠️ Le piège mesuré sur CE dépôt (GA-179) : un compteur doit lire `isError`,
 * pas redériver depuis la forme de la réponse. Ici le piège symétrique est
 * SQL : le prédicat qui FILTRE doit être EXACTEMENT celui qui COMPTE — sinon
 * le bandeau et la liste qu'il surmonte finiraient par se contredire.
 *
 * ⚠️ Le faux dépôt ci-dessous CLONE vraiment (comme celui d'
 * `accounts.headline-counters.spec.ts`, pour la même raison écrite là-bas) :
 * un `clone()` qui rendrait `this` ferait retomber le prédicat du FILTRE et
 * celui d'un COMPTEUR sur le même accumulateur, alors que ce sont deux
 * requêtes distinctes (`qb.clone().getCount()` pour le total de pagination,
 * un clone par compteur de tête). Le total de pagination est le premier clone
 * créé : c'est lui qu'on lit pour prouver que le FILTRE a bien atteint la
 * requête qui compte le total, pas seulement une des quatre pastilles.
 */

type Fake = {
  service: AccountsService
  /** Le prédicat accumulé sur le PREMIER clone créé — celui du total de
   *  pagination (`qb.clone().getCount()`), donc AVANT tout clone de compteur. */
  firstClonePredicate: string | null
}

function createFake(options: { countBy?: (predicate: string | null) => number } = {}): Fake {
  let firstClonePredicate: string | null | undefined
  const state = { counted: 0 }

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
        const child = makeQb(own)
        // Le PREMIER clone créé est celui du total de pagination
        // (`qb.clone().getCount()`, avant tout clone de `headlineCounters`).
        if (firstClonePredicate === undefined) firstClonePredicate = own
        return child
      },
      async getCount() {
        state.counted += 1
        return options.countBy ? options.countBy(own) : 0
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
  }
}

describe('#1580 — le bandeau de tête filtre la liste, sur le prédicat qui la compte', () => {
  it('`headline: withoutNextAction` filtre sur EXACTEMENT le prédicat qui compte cette métrique', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { headline: 'withoutNextAction', offset: 0 })

    expect(fake.firstClonePredicate).toContain(ACCOUNT_HYGIENE_PREDICATES.followedAccounts)
    expect(fake.firstClonePredicate).toContain(ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask)
  })

  it('`headline: newSignals7d` ne compte QUE les détections exactes — même règle que le compteur', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { headline: 'newSignals7d', offset: 0 })

    expect(fake.firstClonePredicate).toContain('signal_history')
    expect(fake.firstClonePredicate).toContain('first_detection_exact = true')
  })

  it('`headline: accessClassAB` lit la barrière sous ses deux graphies, comme le compteur', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { headline: 'accessClassAB', offset: 0 })

    expect(fake.firstClonePredicate).toContain("'access_barrier'")
    expect(fake.firstClonePredicate).toContain("'accessBarrier'")
    expect(fake.firstClonePredicate).toContain("IN ('A', 'B')")
  })

  it('refonte Théo — `headline: toResume` = suivis AVEC une action prévue, les deux prédicats qui le comptent', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { headline: 'toResume', offset: 0 })

    expect(fake.firstClonePredicate).toContain(ACCOUNT_HYGIENE_PREDICATES.followedAccounts)
    expect(fake.firstClonePredicate).toContain('AND NOT (account.id IN (')
    expect(fake.firstClonePredicate).toContain(ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask)
  })

  it('refonte Théo — `headline: activeRelations` = client ou ouverture en cours, comme le compteur', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { headline: 'activeRelations', offset: 0 })

    expect(fake.firstClonePredicate).toContain("IN ('customer', 'opening')")
  })

  it('sans `headline`, aucun prédicat décisionnel n’atteint la liste', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { offset: 0 })

    // La liste porte toujours ses prédicats de base (statut, coquilles vides) —
    // ce que ce test refuse, c'est qu'un axe DÉCISIONNEL s'y glisse tout seul.
    expect(fake.firstClonePredicate).not.toContain(ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask)
    expect(fake.firstClonePredicate).not.toContain('signal_history')
    expect(fake.firstClonePredicate).not.toContain('access_class')
  })

  it('`headline` se COMBINE avec les autres filtres — un axe de plus, jamais un remplacement', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { headline: 'accessClassAB', q: 'lvmh', offset: 0 })

    expect(fake.firstClonePredicate).toContain('company_name ILIKE')
    expect(fake.firstClonePredicate).toContain("IN ('A', 'B')")
  })
})

/**
 * #2150.13 — LA VUE « À ACTUALISER ».
 *
 * La pastille « À rafraîchir » existait PAR LIGNE (analyse de plus de
 * `ACCOUNT_STALE_AFTER_DAYS` jours) et aucun filtre ne restreignait la LISTE à
 * ces comptes : la vue n'aurait pu filtrer que la page déjà chargée. Le filtre
 * serveur lit la MÊME date que la colonne affichée (`LAST_ANALYZED_SQL`) et le
 * MÊME seuil que la pastille — un seul nombre, dans le contrat (GA-26).
 */
describe('#2150.13 — `freshness: stale` restreint la liste aux analyses périmées', () => {
  it('filtre sur la date de dernière analyse AFFICHÉE, au seuil de la pastille', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { freshness: 'stale', offset: 0 })

    expect(fake.firstClonePredicate).toContain('analysis_runs')
    expect(fake.firstClonePredicate).toContain(`make_interval(days => ${ACCOUNT_STALE_AFTER_DAYS + 1})`)
  })

  it('sans `freshness` (ou `all`), aucun prédicat de fraîcheur n’atteint la liste', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { freshness: 'all', offset: 0 })

    expect(fake.firstClonePredicate ?? '').not.toContain('make_interval')
  })
})

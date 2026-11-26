import { AccountsService } from './accounts.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { ACCOUNT_HYGIENE_PREDICATES } from './account-hygiene.sql'
import { CRM_LINKED_ACCOUNT_PREDICATE, IMPORTED_ACCOUNT_PREDICATE } from './account-crm-linked'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * LES COMPTEURS DE TÊTE DU PORTEFEUILLE (PDF-04 §1.3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `/accounts` n'avait AUCUN compteur, et le commentaire d'`AccountContent.tsx`
 * disait pourquoi : la liste est paginée, donc un compteur dérivé des comptes
 * chargés mentirait dès la 2ᵉ page. Il donnait aussi le chemin — « agréger côté
 * serveur, jamais `accounts.filter().length` ». C'est ce chemin-là.
 *
 * Trois propriétés se vérifient ici, et ce sont les trois par lesquelles un
 * compteur ment :
 *
 *  1. Il porte le MÊME périmètre que la liste qu'il surmonte — donc il PART du
 *     constructeur de la liste (clone) et n'écrit pas son SQL à côté.
 *  2. Il ne se paie qu'une fois : pas sur les pages suivantes du défilement.
 *  3. Une lecture ratée vaut ABSENT, jamais `0` — et un raté n'éteint pas les
 *     trois autres.
 *
 * ⚠️ Le faux dépôt ci-dessous CLONE vraiment (chaque clone a ses propres
 * prédicats). Un `clone()` qui rendrait `this` — ce que fait le faux de
 * `accounts.service.spec.ts` — ferait passer ces tests sans rien prouver : les
 * quatre compteurs partageraient un seul jeu de conditions.
 */

type Fake = {
  service: AccountsService
  /** Les prédicats ajoutés par chaque clone, dans l'ordre de création. */
  addedPredicates: string[]
  /** Combien de `getCount()` la requête a servi. */
  counted: number
  /** Combien de clones ont retiré le tri. */
  orderByCleared: number
}

function createFake(options: { countBy?: (predicate: string | null) => number } = {}): Fake {
  const addedPredicates: string[] = []
  const state = { counted: 0, orderByCleared: 0 }

  const makeQb = (inherited: string | null) => {
    let own = inherited
    const qb = {
      where: () => qb,
      andWhere(sql: string) {
        // Seuls les prédicats POSÉS SUR UN CLONE nous intéressent : ceux de la
        // liste elle-même sont déjà couverts par `accounts.service.spec.ts`.
        own = own === null ? sql : `${own} AND ${sql}`
        return qb
      },
      orderBy(expression?: string) {
        if (expression === undefined) state.orderByCleared += 1
        return qb
      },
      addOrderBy: () => qb,
      select: () => qb,
      offset: () => qb,
      limit: () => qb,
      clone() {
        const child = makeQb(own)
        return child
      },
      async getCount() {
        state.counted += 1
        if (own !== null) addedPredicates.push(own)
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

  // Mêmes dépendances mimées que `accounts.service.spec.ts` : la liste n'en
  // touche aucune, et les compteurs pas davantage.
  const service = new AccountsService(accounts as never, {} as never, {} as never, {} as never)
  return {
    service,
    addedPredicates,
    get counted() {
      return state.counted
    },
    get orderByCleared() {
      return state.orderByCleared
    },
  }
}

/**
 * Ce qui distingue le SQL d'un compteur de celui de la liste.
 *
 * Le total de pagination interroge lui aussi la requête ; ses prédicats sont
 * ceux de la liste, et ils apparaissent donc dans la trace. Ces marqueurs
 * isolent les quatre clones qui nous intéressent — et le test qui compte le
 * corpus refuse qu'ils soient zéro.
 */
const COUNTER_MARKERS = [
  ACCOUNT_HYGIENE_PREDICATES.followedAccounts,
  ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask,
  'signal_history',
  'access_class',
] as const

function counterPredicatesOf(all: string[]): string[] {
  return all.filter(sql => COUNTER_MARKERS.some(marker => sql.includes(marker)))
}

describe('Les compteurs de tête du portefeuille', () => {
  // #4581 — un TOTAL d'espace n'est pas un résultat de filtre : poser « Mon CRM », une recherche ou un statut
  // ne change pas ce que l'espace contient. Les compteurs partent de l'ESPACE, pas de la requête filtrée.
  it("#4581 — un filtre posé ne redescend JAMAIS dans le SQL d'un compteur d'espace", async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { offset: 0, crm: 'only', q: 'aureo', status: ['completed'] })

    const totalSql = fake.addedPredicates.filter(sql => sql.endsWith('AND TRUE'))
    expect(totalSql).toHaveLength(1)
    expect(totalSql[0]).not.toContain(CRM_LINKED_ACCOUNT_PREDICATE)
    expect(totalSql[0]).not.toContain('company_name ILIKE')
    // Le compteur « Mon CRM » est lui aussi un total d'espace, jamais « CRM ET CRM » sous le filtre.
    const crmSql = fake.addedPredicates.filter(sql => sql.endsWith(CRM_LINKED_ACCOUNT_PREDICATE))
    expect(crmSql).toHaveLength(1)
    expect(crmSql[0]?.split(CRM_LINKED_ACCOUNT_PREDICATE)).toHaveLength(2)
  })

  it('rend les QUATRE compteurs sur la première page', async () => {
    const fake = createFake({ countBy: () => 3 })
    const page = await fake.service.findAccountsByWorkspace('ws-1', { offset: 0 })

    expect(page.counters).toEqual({
      followed: 3,
      withoutNextAction: 3,
      newSignals7d: 3,
      accessClassAB: 3,
      total: 3,
      activeRelations: 3,
      crm: 3, // #4526.5
      imported: 3, // #4597.1 — « Importés »
    })
  })

  it('#4597.1 — « Importés » porte SA valeur, lue avec SON prédicat (pas celui de « Mon CRM »)', async () => {
    const fake = createFake({ countBy: predicate => (predicate?.endsWith(IMPORTED_ACCOUNT_PREDICATE) ? 9 : 3) })
    const page = await fake.service.findAccountsByWorkspace('ws-1', { offset: 0 })

    expect(page.counters?.imported).toBe(9)
    expect(page.counters?.crm).toBe(3)
  })

  it('chaque compteur INTERROGE sa propre règle — quatre prédicats distincts', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { offset: 0 })

    const counters = counterPredicatesOf(fake.addedPredicates)
    expect(counters).toHaveLength(4)
    expect(new Set(counters).size).toBe(4)
  })

  it("chaque compteur PART de l'ESPACE (mêmes bornes que la liste, aucun filtre de vue) — #4581", () => {
    // Les bornes d'espace (rangés, coquilles vides) sont héritées ; la recherche, elle, ne descend pas : un
    // compteur de bande est un total d'espace, pas le résultat de la requête qu'il surmonte.
    const fake = createFake()
    return fake.service.findAccountsByWorkspace('ws-1', { q: 'edf', offset: 0 }).then(() => {
      const counters = counterPredicatesOf(fake.addedPredicates)
      expect(counters).toHaveLength(4)
      for (const sql of counters) {
        expect(sql).toContain('keep-non-empty-failed')
        expect(sql).not.toContain('company_name ILIKE')
      }
    })
  })

  it('« suivis » et « sans prochaine action » RÉUTILISENT le prédicat du cockpit, sans le recopier', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { offset: 0 })
    const joined = fake.addedPredicates.join('\n')

    // La garde LIT quelque chose : la règle du cockpit doit se retrouver, au
    // caractère près, dans le SQL des compteurs. Si quelqu'un réécrit
    // `commercial_status IN (…)` à la main, ces deux attentes tombent.
    expect(joined).toContain(ACCOUNT_HYGIENE_PREDICATES.followedAccounts)
    expect(joined).toContain(ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask)
  })

  it('« nouveaux signaux » ne compte QUE les détections exactes — un backfill n’est pas une actualité', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { offset: 0 })
    const signals = fake.addedPredicates.find(p => p.includes('signal_history'))

    expect(signals).toBeDefined()
    expect(signals).toContain('first_detection_exact = true')
    expect(signals).toContain("interval '7 days'")
  })

  it('« classe A ou B » lit la barrière sous ses DEUX graphies, et ne range personne en D par défaut', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { offset: 0 })
    const access = fake.addedPredicates.find(p => p.includes('access_class'))

    expect(access).toBeDefined()
    expect(access).toContain("'access_barrier'")
    expect(access).toContain("'accessBarrier'")
    expect(access).toContain("IN ('A', 'B')")
    // Aucun `COALESCE(..., 'D')` ni équivalent : un compte non évalué sort du
    // compte, il n'est pas classé à notre place.
    expect(access).not.toContain("'D'")
  })

  it('les pages SUIVANTES ne les repaient pas — un total ne dépend pas de l’offset', async () => {
    const fake = createFake({ countBy: () => 7 })
    const page = await fake.service.findAccountsByWorkspace('ws-1', { offset: 25 })

    expect(page.counters).toBeUndefined()
    expect(counterPredicatesOf(fake.addedPredicates)).toHaveLength(0)
  })

  it('un compteur illisible vaut ABSENT, jamais « 0 » — et n’éteint pas les trois autres', async () => {
    const fake = createFake({
      countBy: predicate => {
        if (predicate?.includes('signal_history')) throw new Error('relation indisponible')
        return 4
      },
    })
    const page = await fake.service.findAccountsByWorkspace('ws-1', { offset: 0 })

    expect(page.counters).toBeDefined()
    // La question qui compte : `0` serait-il VRAI ? Non — on n'a pas pu lire.
    expect(page.counters).not.toHaveProperty('newSignals7d')
    expect(page.counters?.followed).toBe(4)
    expect(page.counters?.withoutNextAction).toBe(4)
    expect(page.counters?.accessClassAB).toBe(4)
  })

  it('les QUATRE illisibles ⇒ aucun compteur, et surtout pas un objet de zéros', async () => {
    const fake = createFake({
      countBy: predicate => {
        if (predicate !== null) throw new Error('base injoignable')
        return 0
      },
    })
    const page = await fake.service.findAccountsByWorkspace('ws-1', { offset: 0 })

    expect(page.counters).toBeUndefined()
  })

  it('chaque compteur RETIRE le tri de la liste — `COUNT(*)` n’a pas à exécuter la sous-requête de tri', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace('ws-1', { offset: 0 })

    expect(fake.orderByCleared).toBe(8) // #4526.5 : + « Mon CRM » ; #4597.1 : + « Importés »
  })
})

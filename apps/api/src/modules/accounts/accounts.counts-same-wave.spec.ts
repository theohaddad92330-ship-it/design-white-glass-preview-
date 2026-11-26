import { AccountsService } from './accounts.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * LOT 7 / CORRECTIF A — LE TOTAL DE PAGINATION ET LES QUATRE COMPTEURS DE TÊTE
 * PARTENT DANS LA MÊME VAGUE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER TIENT, ET CE QU'IL NE TIENT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `findAccountsByWorkspace` faisait `await qb.clone().getCount()` (le total),
 * PUIS `await this.headlineCounters(qb)` (les 4 compteurs, déjà en
 * `Promise.all` entre eux) — deux vagues d'aller-retour réseau vers Postgres
 * là où rien ne les ordonne : ni le total ne borne les compteurs, ni l'inverse
 * (`headlineCounters` ne lit que `offset`, jamais `total`). Le SELECT des
 * lignes n'est PAS dans le périmètre de cette vague — il reste après, comme
 * demandé.
 *
 * La preuve ne peut pas être une DURÉE : rien ne la reproduit de façon fiable
 * en CI (charge machine, jitter réseau). La preuve est un COMPTE : au moment
 * où `findAccountsByWorkspace(...)` est appelée SANS être attendue, le nombre
 * de `getCount()` déjà EN VOL (appelés, pas encore résolus) doit être 9 — pas
 * 1 puis 7 plus tard. C'est déterministe : tant qu'aucune promesse de
 * `getCount()` n'est résolue, tout le code synchrone-jusqu'au-premier-`await`
 * qui suit a déjà dû s'exécuter, y compris à l'intérieur de `headlineCounters`
 * et des quatre `count()` de son propre `Promise.all`.
 *
 * ⚠️ Avec le code SÉQUENTIEL d'avant (`await total` puis `await
 * headlineCounters`), l'appel se SUSPEND au premier `await` avant même
 * d'appeler `headlineCounters` : à cet instant précis, un seul `getCount()`
 * est en vol. C'est la preuve que cette garde sait dire NON — voir le rouge
 * collé dans le rapport du lot.
 */

/** Un `getCount()` qui ne répond QUE quand le test le décide — jamais tout
 *  seul, jamais après un délai. Le compte de vagues ne dépend d'aucune
 *  minuterie. */
type DeferredCount = { predicate: string | null; resolve: (n: number) => void }

type Fake = {
  service: AccountsService
  /** Chaque `getCount()` appelé, dans l'ordre, AVANT toute résolution. */
  pending: DeferredCount[]
}

function createFakeWithDeferredCounts(): Fake {
  const pending: DeferredCount[] = []

  const makeQb = (inherited: string | null): Record<string, unknown> => {
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
        return makeQb(own)
      },
      // ⚠️ Ne résout JAMAIS de lui-même : c'est ce qui rend le compte
      // observable de façon synchrone, sans microtask-flush ni minuterie.
      getCount(): Promise<number> {
        return new Promise<number>(resolve => {
          pending.push({ predicate: own, resolve })
        })
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
  accounts.query = jest.fn(async () => []) as never

  const service = new AccountsService(accounts as never, {} as never, {} as never, {} as never)
  return { service, pending }
}

describe('Le total et les 4 compteurs de tête partent dans la MÊME vague (LOT 7 / correctif A)', () => {
  it('9 `getCount()` sont EN VOL avant qu’aucun ne réponde — 1 total + 8 compteurs (4 + total, relations actives, Mon CRM #4526.5, Importés #4597.1)', () => {
    const fake = createFakeWithDeferredCounts()

    // Volontairement PAS `await` : ce qui nous intéresse est l'état du monde
    // juste après l'appel, avant que quiconque n'ait eu la main pour résoudre
    // quoi que ce soit.
    void fake.service.findAccountsByWorkspace('ws-1', { offset: 0 })

    expect(fake.pending).toHaveLength(9)
  })

  it('les 9 valeurs se retrouvent au bon endroit une fois résolues, dans n’importe quel ORDRE de résolution', async () => {
    const fake = createFakeWithDeferredCounts()
    const resultPromise = fake.service.findAccountsByWorkspace('ws-1', { offset: 0 })

    expect(fake.pending).toHaveLength(9)
    // Résolution en ordre INVERSE : si le code lisait encore le résultat du
    // total pour décider d'appeler les compteurs (une vraie dépendance), cet
    // ordre le ferait échouer.
    ;[...fake.pending].reverse().forEach((call, i) => call.resolve(i === 8 ? 42 : 3))

    const page = await resultPromise
    expect(page.pagination.totalItems).toBe(42)
    expect(page.counters).toEqual({
      followed: 3,
      withoutNextAction: 3,
      newSignals7d: 3,
      accessClassAB: 3,
      total: 3,
      activeRelations: 3,
      // #4526.5 — « Mon CRM » : le huitième `getCount()` part dans la MÊME vague.
      crm: 3,
      // #4597.1 — « Importés » : le neuvième `getCount()` part dans la MÊME vague.
      imported: 3,
    })
  })

  it('page suivante (offset > 0) : un seul `getCount()` en vol — le total, sans les compteurs', () => {
    const fake = createFakeWithDeferredCounts()

    void fake.service.findAccountsByWorkspace('ws-1', { offset: 25 })

    expect(fake.pending).toHaveLength(1)
  })
})

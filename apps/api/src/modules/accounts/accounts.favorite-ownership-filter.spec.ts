import { AccountsService } from './accounts.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { USER_FAVORITES_TABLE } from '../favorites/user-favorite.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #2150.14/.15/.18 — LE FAVORI DE COMPTE ET « PARTAGÉS AVEC MON ÉQUIPE ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Revirement ASSUMÉ de #1800 (09/09/2026) — retour bêta #2150, Louis
 * 15/09/2026. Deux axes, testés ici sur le MÊME modèle que
 * `accounts.headline-filter.spec.ts` (le faux dépôt CLONE vraiment, pour la
 * même raison écrite là-bas) :
 *
 *  · `favorite: 'mine'` — restreint aux comptes que L'APPELANT a
 *    personnellement mis en favori. Le test qui compte : la ligne SQL est
 *    paramétrée sur `currentUserId`, PAS sur une valeur fixe — un favori de
 *    l'utilisateur A n'apparaît jamais dans la requête construite pour B,
 *    parce que ce n'est littéralement pas le même paramètre qui est lié.
 *  · `ownership: 'teammate'` — restreint aux comptes PORTÉS PAR UN COLLÈGUE
 *    (`assigned_to` renseigné, ≠ l'appelant). Un compte libre
 *    (`assigned_to IS NULL`) n'entre jamais dans ce filtre.
 *
 * Les deux exigent l'identité de l'appelant : sans elle, ce sont des filtres
 * personnels qu'aucun SQL ne peut honnêtement calculer — le service REFUSE
 * plutôt que de rendre un portefeuille non filtré sous un libellé qui promet
 * un filtre (même posture que `marketCovered: 'covered'` sans
 * `marketCoveredIds`, quelques lignes plus haut dans ce même service).
 */

type Fake = {
  service: AccountsService
  firstClonePredicate: string | null
  favoriteUserIdCalls: unknown[]
}

function createFake(): Fake {
  let firstClonePredicate: string | null | undefined
  const favoriteUserIdCalls: unknown[] = []

  const makeQb = (inherited: string | null) => {
    let own = inherited
    const qb = {
      where: () => qb,
      andWhere(sql: string) {
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
  }
}

describe("#2150.14/.18 — `favorite: 'mine'` restreint aux favoris de l'appelant", () => {
  it('EXISTS sur `user_favorites`, scopé à `entity_type = account`', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace(
      'ws-1',
      { favorite: 'mine', offset: 0 },
      null,
      undefined,
      undefined,
      'user-a',
    )

    expect(fake.firstClonePredicate).toContain(USER_FAVORITES_TABLE)
    expect(fake.firstClonePredicate).toContain("entity_type = 'account'")
    expect(fake.firstClonePredicate).toContain('EXISTS')
  })

  it("lie le paramètre à L'APPELANT — un favori de A n'apparaît jamais dans la requête de B", async () => {
    const fakeA = createFake()
    await fakeA.service.findAccountsByWorkspace(
      'ws-1',
      { favorite: 'mine', offset: 0 },
      null,
      undefined,
      undefined,
      'user-a',
    )
    expect(fakeA.favoriteUserIdCalls).toContain('user-a')
    expect(fakeA.favoriteUserIdCalls).not.toContain('user-b')

    const fakeB = createFake()
    await fakeB.service.findAccountsByWorkspace(
      'ws-1',
      { favorite: 'mine', offset: 0 },
      null,
      undefined,
      undefined,
      'user-b',
    )
    expect(fakeB.favoriteUserIdCalls).toContain('user-b')
    expect(fakeB.favoriteUserIdCalls).not.toContain('user-a')
  })

  it('sans `currentUserId`, refuse plutôt que de rendre le portefeuille non filtré', async () => {
    const fake = createFake()
    await expect(
      fake.service.findAccountsByWorkspace(
        'ws-1',
        { favorite: 'mine', offset: 0 },
        null,
        undefined,
        undefined,
        undefined,
      ),
    ).rejects.toThrow()
  })

  it("sans `favorite` (ou `all`), aucun prédicat de favori n'atteint la liste", async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace(
      'ws-1',
      { favorite: 'all', offset: 0 },
      null,
      undefined,
      undefined,
      'user-a',
    )

    expect(fake.firstClonePredicate ?? '').not.toContain(USER_FAVORITES_TABLE)
  })
})

describe("#2150.15 — `ownership: 'teammate'` restreint aux comptes portés par un collègue", () => {
  it("exclut les comptes SANS propriétaire ET les comptes de l'appelant lui-même", async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace(
      'ws-1',
      { ownership: 'teammate', offset: 0 },
      null,
      undefined,
      undefined,
      'user-a',
    )

    expect(fake.firstClonePredicate).toContain('assigned_to IS NOT NULL')
    expect(fake.firstClonePredicate).toContain('assigned_to <>')
  })

  it('sans `currentUserId`, refuse plutôt que de deviner qui exclure', async () => {
    const fake = createFake()
    await expect(
      fake.service.findAccountsByWorkspace(
        'ws-1',
        { ownership: 'teammate', offset: 0 },
        null,
        undefined,
        undefined,
        undefined,
      ),
    ).rejects.toThrow()
  })

  it("sans `ownership` (ou `all`), aucun prédicat de portage n'atteint la liste", async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace(
      'ws-1',
      { ownership: 'all', offset: 0 },
      null,
      undefined,
      undefined,
      'user-a',
    )

    expect(fake.firstClonePredicate ?? '').not.toContain('assigned_to IS NOT NULL')
  })

  it('se COMBINE avec `favorite` — deux axes de plus, jamais un remplacement', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace(
      'ws-1',
      { favorite: 'mine', ownership: 'teammate', offset: 0 },
      null,
      undefined,
      undefined,
      'user-a',
    )

    expect(fake.firstClonePredicate).toContain(USER_FAVORITES_TABLE)
    expect(fake.firstClonePredicate).toContain('assigned_to IS NOT NULL')
  })
})

describe("#4158.25 — `ownership: 'mine'` : « mes comptes » = responsable OU co-équipier", () => {
  it('retient les comptes dont je suis responsable ET ceux où je suis co-équipier actif', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace(
      'ws-1',
      { ownership: 'mine', offset: 0 },
      null,
      undefined,
      undefined,
      'user-a',
    )

    expect(fake.firstClonePredicate).toContain('assigned_to = :mineUserId')
    expect(fake.firstClonePredicate).toContain('account_team_members')
    // Un co-équipier RETIRÉ (`removed_at`) n'est plus dans l'équipe.
    expect(fake.firstClonePredicate).toContain('removed_at IS NULL')
  })

  it('sans `currentUserId`, refuse plutôt que de deviner qui est « moi »', async () => {
    const fake = createFake()
    await expect(
      fake.service.findAccountsByWorkspace(
        'ws-1',
        { ownership: 'mine', offset: 0 },
        null,
        undefined,
        undefined,
        undefined,
      ),
    ).rejects.toThrow()
  })

  it('ne change PAS la visibilité : aucun prédicat d’équipe sans ce filtre', async () => {
    const fake = createFake()
    await fake.service.findAccountsByWorkspace(
      'ws-1',
      { ownership: 'teammate', offset: 0 },
      null,
      undefined,
      undefined,
      'user-a',
    )
    expect(fake.firstClonePredicate ?? '').not.toContain('account_team_members')
  })
})

/**
 * #4996 L3 — le cloisonnement `restricted` passe par UNE clause (`portfolioScopeClause`) :
 * le co-équipier actif d'un compte porté par un autre le voit ; le même `:ownerId`
 * lie les deux moitiés, donc un non-membre (autre identifiant) ne le voit pas.
 */
describe('#4996 L3 — cloisonné : le co-équipier voit, le non-membre non', () => {
  function recorder() {
    const calls: { sql: string; params: Record<string, unknown> | undefined }[] = []
    const qb = {
      select: () => qb,
      where: () => qb,
      andWhere(sql: string, params?: Record<string, unknown>) {
        calls.push({ sql, params })
        return qb
      },
      orderBy: () => qb,
      limit: () => qb,
      async getRawMany() {
        return []
      },
    }
    const accounts = createMockRepository<AccountEntity>() as MockRepository<AccountEntity>
    accounts.createQueryBuilder = jest.fn(() => qb) as never
    return { calls, service: new AccountsService(accounts as never, {} as never, {} as never, {} as never) }
  }

  it.each(['listPortfolioLookups', 'listActiveAnalysisRuns'] as const)(
    '%s : la clause couvre porté / libre / co-équipier actif, liée à l’appelant',
    async method => {
      const { calls, service } = recorder()
      await service[method]('ws-1', { ownerId: 'user-a', includeUnassigned: true })
      const scoped = calls.find(call => call.params && 'ownerId' in call.params)
      expect(scoped?.params).toEqual({ ownerId: 'user-a' })
      expect(scoped?.sql).toContain('account.assigned_to = :ownerId')
      expect(scoped?.sql).toContain('account.assigned_to IS NULL')
      expect(scoped?.sql).toContain('FROM account_team_members atm')
      expect(scoped?.sql).toContain('atm.user_id = :ownerId')
      expect(scoped?.sql).toContain('atm.removed_at IS NULL')
    },
  )

  it('NON — pour un autre appelant, le paramètre lié est le sien : jamais celui de user-a', async () => {
    const { calls, service } = recorder()
    await service.listPortfolioLookups('ws-1', { ownerId: 'user-b', includeUnassigned: true })
    const scoped = calls.find(call => call.params && 'ownerId' in call.params)
    expect(scoped?.params).toEqual({ ownerId: 'user-b' })
  })

  it('sans scope (ouvert / team:manage), aucune clause de cloisonnement', async () => {
    const { calls, service } = recorder()
    await service.listPortfolioLookups('ws-1', null)
    expect(calls.some(call => call.params && 'ownerId' in call.params)).toBe(false)
  })
})

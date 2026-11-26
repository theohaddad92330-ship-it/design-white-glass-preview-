import { AccountsService } from '../accounts/accounts.service'
import { NeedPlayService } from '../accounts/need-play.service'

/**
 * GA-367 — LES AGRÉGATS DE PORTEFEUILLE PORTENT AUSSI LE PÉRIMÈTRE (#2084.24).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT (revue de sécurité du 20/09/2026, trou n° 2)
 * ─────────────────────────────────────────────────────────────────────────────
 * La liste des comptes portait le périmètre ; les FACETTES de cette liste, non.
 * Un membre cloisonné à une agence ouvrait le filtre « Entreprise » et y lisait
 * les RAISONS SOCIALES de tout l'espace — celles des comptes que la liste
 * venait précisément de lui cacher. Même chose pour les secteurs et les
 * étiquettes, qui dessinent en creux le portefeuille des autres agences.
 *
 * C'est aussi ce qui rendait le trou n° 1 exploitable : `companies` donnait le
 * nom, et il ne restait qu'à obtenir l'identifiant pour archiver ou supprimer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE BORNER UN AGRÉGAT NE VEUT **PAS** DIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * · Pas « rendre 0 ». Ces trois routes rendent des LISTES de valeurs observées :
 *   hors périmètre, la valeur n'est pas « zéro compte », elle n'est pas dans le
 *   dénombrement du tout — elle sort du dénominateur (GA-18/GA-19). Une facette
 *   dit ce qu'on SAIT du portefeuille qu'on a le droit de voir, jamais ce que
 *   le marché fait (GA-259).
 * · Pas une SECONDE forme de clause. La règle vit dans
 *   `business-unit-scope.clause.ts` et nulle part ailleurs (GA-26) : les trois
 *   requêtes réutilisent celle de la liste, avec sa seconde moitié intacte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE
 * ─────────────────────────────────────────────────────────────────────────────
 * · Le REFUS : la clause arrive RÉELLEMENT dans la requête, et elle porte les
 *   identifiants du périmètre. Un test qui vérifierait seulement qu'un appel
 *   part ne dirait rien.
 * · Le TÉMOIN : sans cloisonnement (`null`, le niveau de tout le monde à cette
 *   heure), la requête est byte-identique à ce qu'elle était — aucune clause de
 *   périmètre, aucun paramètre de plus. Une garde trop large casserait la
 *   facette pour l'immense majorité qui n'a jamais créé d'unité.
 * · La BORNE D'ESPACE SURVIT : c'est le risque grave (GA-43, des espaces sont
 *   des concurrents). Une clause de périmètre posée en `where` au lieu de
 *   `andWhere` l'écraserait, et l'écran aurait l'air juste.
 */

const SCOPE_LYON = { businessUnitIds: ['bu-lyon'], includeUnassigned: true } as const

const clausesOf = (qb: { where: jest.Mock; andWhere: jest.Mock }) => [
  ...(qb.where.mock.calls as unknown[][]).map(call => String(call[0])),
  ...(qb.andWhere.mock.calls as unknown[][]).map(call => String(call[0])),
]

const buildService = () => {
  const qb = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    select: jest.fn(() => qb),
    limit: jest.fn(() => qb),
    getRawMany: jest.fn().mockResolvedValue([]),
  }
  const accounts = {
    createQueryBuilder: jest.fn(() => qb),
    // `listTags` s'écrit en SQL BRUT, avec des paramètres POSITIONNELS : c'est
    // exactement la famille de requêtes qui avait échappé au cloisonnement la
    // première fois (le détail d'un compte, R15N-16).
    query: jest.fn().mockResolvedValue([]),
    manager: { query: jest.fn().mockResolvedValue([]) },
  }
  return { service: new AccountsService(accounts as never, {} as never, {} as never, {} as never), qb, accounts }
}

/**
 * Les plans d'attaque de besoin vivent dans leur propre service, avec leur
 * propre dépôt : c'est pourquoi ils ont leur harnais à eux.
 */
const buildNeedPlayService = () => {
  const qb = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    getMany: jest.fn().mockResolvedValue([]),
  }
  const plays = { createQueryBuilder: jest.fn(() => qb) }
  const service = new NeedPlayService(
    plays as never,
    {} as never, // accounts
    {} as never, // contacts
    {} as never, // ia
    {} as never, // credits
    {} as never, // esnProfile
    {} as never, // userActions
  )
  return { service, qb }
}

type AppelFacette = (service: AccountsService, scope: unknown) => Promise<unknown>

/**
 * Les facettes en QueryBuilder — chacune avec l'appel qui l'exerce, parce que
 * leurs signatures diffèrent (`listAccountSignals` porte un `userId` au milieu).
 * `undefined` en dernier argument est le chemin de l'appelant qui IGNORE la
 * dimension : il doit rester byte-identique.
 */
const FACETTES_QB: ReadonlyArray<[string, AppelFacette, (s: AccountsService) => Promise<unknown>]> = [
  [
    'listCompanies (les RAISONS SOCIALES — la fuite la plus nommable)',
    (s, scope) => s.listCompanies('w-1', scope as never),
    s => s.listCompanies('w-1'),
  ],
  [
    'listSectors (les secteurs du portefeuille)',
    (s, scope) => s.listSectors('w-1', scope as never),
    s => s.listSectors('w-1'),
  ],
  [
    'listAccountSignals (la Veille — elle NOMME les comptes)',
    (s, scope) => s.listAccountSignals('w-1', undefined, scope as never),
    s => s.listAccountSignals('w-1'),
  ],
  [
    'listBestReferenceSectors (les comptes « meilleure référence »)',
    (s, scope) => s.listBestReferenceSectors('w-1', scope as never),
    s => s.listBestReferenceSectors('w-1'),
  ],
]

describe('GA-367 — une facette de portefeuille ne déborde pas de l’unité opérationnelle', () => {
  it.each(FACETTES_QB)('%s porte la clause de périmètre jusqu’à la requête', async (_nom, appel) => {
    const { service, qb } = buildService()

    await appel(service, SCOPE_LYON)

    const perimetre = clausesOf(qb).filter(clause => clause.includes('business_unit_id'))
    expect(perimetre).toHaveLength(1)
    // La seconde moitié n'est pas décorative : sans elle, tout le portefeuille
    // historique (sans unité) disparaîtrait le jour du déploiement.
    expect(perimetre[0]).toContain('OR account.business_unit_id IS NULL')
  })

  it.each(FACETTES_QB)('%s garde sa borne d’ESPACE — le risque grave', async (_nom, appel) => {
    const { service, qb } = buildService()

    await appel(service, SCOPE_LYON)

    // Exactement UNE borne d'espace, et elle n'a pas été écrasée par la clause
    // de périmètre (`andWhere`, jamais `where`).
    expect(clausesOf(qb).filter(clause => clause.includes('workspace_id'))).toHaveLength(1)
  })

  it('listTags — le SQL BRUT porte la clause ET l’identifiant du périmètre', async () => {
    const { service, accounts } = buildService()

    await service.listTags('w-1', SCOPE_LYON)

    const [sql, params] = accounts.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('business_unit_id')
    expect(sql).toContain('a.workspace_id = $1')
    expect(params).toContainEqual([...SCOPE_LYON.businessUnitIds])
  })

  it('listAccountNeeds — le SQL BRUT porte la clause ET l’identifiant du périmètre', async () => {
    const { service, accounts } = buildService()

    await service.listAccountNeeds('w-1', SCOPE_LYON)

    const [sql, params] = accounts.manager.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('business_unit_id')
    expect(sql).toContain('a.workspace_id = $1')
    expect(params).toContainEqual([...SCOPE_LYON.businessUnitIds])
  })

  it('hygieneByAccount — les DEUX lectures portent le périmètre, pas une seule', async () => {
    // L'hygiène est faite de deux requêtes indépendantes, et elles échouent
    // séparément exprès. N'en borner qu'une laisserait la moitié de la fuite —
    // et la moitié restante compte des CONTACTS de comptes d'une autre unité.
    const { service, accounts } = buildService()

    await service.hygieneByAccount('w-1', SCOPE_LYON)

    expect(accounts.manager.query).toHaveBeenCalledTimes(2)
    for (const [sql, params] of accounts.manager.query.mock.calls as [string, unknown[]][]) {
      expect(sql).toContain('business_unit_id')
      expect(params).toContainEqual([...SCOPE_LYON.businessUnitIds])
    }
  })

  it('hygieneByAccount — la lecture des CONTACTS remonte au compte pour se borner', async () => {
    // `contacts` ne porte pas de colonne d'unité : la borne se lit sur le
    // COMPTE du contact, par un `EXISTS`. La forme importe — un `JOIN` aurait
    // en plus fait disparaître les contacts dont le compte n'existe plus, ce
    // qui n'est pas la question posée ici.
    const { service, accounts } = buildService()

    await service.hygieneByAccount('w-1', SCOPE_LYON)

    const [sql] = accounts.manager.query.mock.calls[1] as [string, unknown[]]
    expect(sql).toContain('EXISTS')
    expect(sql).toContain('c.workspace_id = $1')
    expect(sql).not.toContain('JOIN accounts')
  })

  it('les PLANS DE BESOIN de l’équipe s’arrêtent au périmètre du compte attaqué', async () => {
    // `need_plays` ne porte pas de colonne d'unité non plus : la borne se lit
    // sur le COMPTE que le plan attaque. Le plan NOMME ce compte — le laisser
    // sortir révélerait quelles entreprises les autres unités préparent.
    const { service, qb } = buildNeedPlayService()

    await service.listForWorkspace('w-1', SCOPE_LYON)

    const perimetre = clausesOf(qb).filter(clause => clause.includes('business_unit_id'))
    expect(perimetre).toHaveLength(1)
    expect(perimetre[0]).toContain('EXISTS')
    expect(perimetre[0]).toContain('OR a.business_unit_id IS NULL')
    expect(clausesOf(qb).filter(clause => clause.includes('workspace_id'))).toHaveLength(1)
  })

  it('les PLANS DE BESOIN sans cloisonnement ne posent AUCUNE clause de périmètre', async () => {
    const sans = buildNeedPlayService()
    await sans.service.listForWorkspace('w-1', null)

    const defaut = buildNeedPlayService()
    await defaut.service.listForWorkspace('w-1')

    expect(clausesOf(sans.qb).filter(clause => clause.includes('business_unit_id'))).toEqual([])
    expect(clausesOf(defaut.qb)).toEqual(clausesOf(sans.qb))
  })
})

describe('GA-367 — TÉMOIN : sans cloisonnement, la facette est byte-identique', () => {
  it.each(FACETTES_QB)('%s ne pose AUCUNE clause de périmètre', async (_nom, appel, appelSansParametre) => {
    const sans = buildService()
    await appel(sans.service, null)

    const defaut = buildService()
    // …et l'appel SANS le paramètre du tout (API publique, MCP) ne change pas
    // non plus : c'est le chemin de tous les appelants qui ignorent la dimension.
    await appelSansParametre(defaut.service)

    expect(clausesOf(sans.qb).filter(clause => clause.includes('business_unit_id'))).toEqual([])
    expect(clausesOf(defaut.qb)).toEqual(clausesOf(sans.qb))
  })

  it('listTags sans cloisonnement garde son SQL et ses deux paramètres', async () => {
    const { service, accounts } = buildService()

    await service.listTags('w-1')

    const [sql, params] = accounts.query.mock.calls[0] as [string, unknown[]]
    expect(sql).not.toContain('business_unit_id')
    expect(params).toHaveLength(2)
  })

  it('listAccountNeeds sans cloisonnement garde son SQL et son unique paramètre', async () => {
    const { service, accounts } = buildService()

    await service.listAccountNeeds('w-1')

    const [sql, params] = accounts.manager.query.mock.calls[0] as [string, unknown[]]
    expect(sql).not.toContain('business_unit_id')
    expect(params).toHaveLength(1)
  })

  it('hygieneByAccount sans cloisonnement garde ses deux requêtes intactes', async () => {
    const { service, accounts } = buildService()

    await service.hygieneByAccount('w-1')

    for (const [sql, params] of accounts.manager.query.mock.calls as [string, unknown[]][]) {
      expect(sql).not.toContain('business_unit_id')
      expect(params).toHaveLength(2)
    }
  })
})

describe('GA-367 — un périmètre VIDE ne veut pas dire « voit tout »', () => {
  it.each(FACETTES_QB)('%s rend la clause « sans unité », jamais aucune clause', async (_nom, appel) => {
    // « Il ne porte aucun périmètre » n'est pas « il voit tout » : c'est
    // l'erreur qui ouvrirait l'espace entier au premier membre mal configuré.
    const { service, qb } = buildService()

    await appel(service, { businessUnitIds: [], includeUnassigned: true })

    expect(clausesOf(qb).filter(clause => clause.includes('business_unit_id'))).toEqual([
      'account.business_unit_id IS NULL',
    ])
  })

  it('listTags avec un périmètre vide filtre aussi, sans paramètre d’identifiants', async () => {
    const { service, accounts } = buildService()

    await service.listTags('w-1', { businessUnitIds: [], includeUnassigned: true })

    const [sql, params] = accounts.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('business_unit_id IS NULL')
    expect(params).toHaveLength(2)
  })

  it('listAccountNeeds avec un périmètre vide filtre aussi, sans paramètre d’identifiants', async () => {
    const { service, accounts } = buildService()

    await service.listAccountNeeds('w-1', { businessUnitIds: [], includeUnassigned: true })

    const [sql, params] = accounts.manager.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('business_unit_id IS NULL')
    expect(params).toHaveLength(1)
  })
})

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { hasPermission } from '@bellum/contracts'
import { AccountsService } from '../accounts/accounts.service'
import { businessUnitScopeClause } from '../accounts/business-unit-scope.clause'
import { BusinessUnitService } from './business-unit.service'

/**
 * GA-333 — LE CLOISONNEMENT DE PÉRIMÈTRE (BU / agence), prouvé des deux côtés.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le §10 de `.claude/projet.md` interdit de coder seul sur les droits, les rôles
 * et le partitionnement `workspace_id`. L'arrêt a été levé le 15/09/2026 avec
 * UNE condition, qui fait partie du travail : « chaque règle d'accès est un test
 * NOMMÉ qui sait dire NON, et la PR ne se merge pas sans qu'il l'ait lue ».
 *
 * La règle PURE est testée sans base dans `packages/contracts`
 * (`business-unit.test.ts`). Ce fichier-ci tient l'autre moitié, celle qui manque
 * le plus souvent : **la règle est réellement transmise à la requête**, et la
 * borne d'espace SURVIT à son arrivée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE RISQUE N°1, NOMMÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Une jointure ajoutée qui REMPLACE `WHERE workspace_id = …` par
 * `WHERE business_unit_id = …` ouvre l'espace entier — et l'écran a l'air juste,
 * parce qu'il montre des comptes d'une BU. Deux tests ci-dessous ne parlent que
 * de ça : celui de la clause qui survit, et celui des appartenances lues avec
 * LEURS DEUX colonnes.
 *
 * ⚠️ Preuve que ces tests savent dire NON — MESURÉE le 15/09/2026, quatre
 * cassures volontaires, compte relevé à chaque fois (18 verts intacts) :
 *  · appel `applyBusinessUnitScope` retiré de `findAccountsByWorkspace` → 4 rouges ;
 *  · `where` au lieu de `andWhere` (la borne d'espace écrasée)          → 2 rouges ;
 *  · appartenances lues par `user_id` SEUL (fuite inter-espaces)        → 2 rouges ;
 *  · clause sans « OU rattaché à aucun périmètre »                      → 3 rouges.
 * Le script de la mesure : `scratchpad/w13-prove-no-api.sh`.
 */

const scopeClauses = (qb: { andWhere: jest.Mock; where: jest.Mock }) =>
  [...(qb.where.mock.calls as unknown[][]), ...(qb.andWhere.mock.calls as unknown[][])]
    .map(call => String(call[0]))
    .filter(clause => clause.includes('business_unit_id'))

const allClauses = (qb: { andWhere: jest.Mock; where: jest.Mock }) => [
  ...(qb.where.mock.calls as unknown[][]).map(call => String(call[0])),
  ...(qb.andWhere.mock.calls as unknown[][]).map(call => String(call[0])),
]

const buildAccountsService = () => {
  const qb = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    leftJoin: jest.fn(() => qb),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getRawMany: jest.fn().mockResolvedValue([]),
    // LOT 7 / correctif A (fusion vague 15) — `findAccountsByWorkspace` clone le
    // query builder pour le total ET pour chaque compteur de tête
    // (`qb.clone().getCount()`), en dehors de tout try/catch pour le total : un
    // mock sans `clone` fait tomber TOUTE la méthode, pas seulement un compteur.
    clone: jest.fn(() => qb),
    getCount: jest.fn().mockResolvedValue(0),
  }
  // Le DÉTAIL d'un compte ne passe pas par le QueryBuilder : il s'écrit en SQL
  // brut, avec des paramètres positionnels. C'est précisément pour ça qu'il
  // avait échappé au cloisonnement — et à la garde.
  const query = jest.fn().mockResolvedValue([{ id: 'acc-paris', business_unit_id: 'bu-paris' }])
  // #4581 — les compteurs de tête partent d'un SECOND constructeur (l'espace visible, sans filtre de vue) : il
  // est inerte ici, pour que `qb` ne garde que les clauses de la LISTE que ces gardes lisent.
  const spaceCounters: Record<string, unknown> = new Proxy(
    {},
    { get: (_t, key) => (key === 'getCount' ? jest.fn().mockResolvedValue(0) : jest.fn(() => spaceCounters)) },
  )
  let builders = 0
  const accounts = { createQueryBuilder: jest.fn(() => (builders++ === 0 ? qb : spaceCounters)), manager: { query } }
  return { service: new AccountsService(accounts as never, {} as never, {} as never, {} as never), qb, query }
}

const buildBusinessUnitService = (options: {
  access?: string | null
  membership?: boolean
  memberships?: { business_unit_id: string }[]
  /** Le rôle RBAC de la ligne `workspace_members` LUE — ce n'est pas le niveau d'accès. */
  role?: string
  /** Le périmètre visé est-il DÉJÀ porté ? (le no-op de « rejoindre deux fois ») */
  alreadyMember?: boolean
  /** #2081.14 — la règle d'espace « visibilité des comptes d'une unité ». */
  visibility?: 'shared' | 'private'
}) => {
  const businessUnitMembers = {
    find: jest.fn().mockResolvedValue(options.memberships ?? []),
    findOne: jest.fn().mockResolvedValue(options.alreadyMember ? { business_unit_id: 'bu-paris' } : null),
    save: jest.fn(),
    create: jest.fn((row: unknown) => row),
    remove: jest.fn(),
  }
  const workspaceMembers = {
    findOne: jest.fn().mockResolvedValue(
      options.membership === false
        ? null
        : {
            business_unit_access: options.access ?? 'workspace',
            role: options.role ?? 'sales_ops',
          },
    ),
    save: jest.fn(),
  }
  const businessUnits = {
    find: jest.fn().mockResolvedValue([]),
    // Le périmètre visé EXISTE dans cet espace : sans cela, `findInWorkspace`
    // lèverait « introuvable » et les tests d'éligibilité ci-dessous ne
    // prouveraient rien — ils passeraient pour la mauvaise raison.
    findOne: jest.fn().mockResolvedValue({ id: 'bu-paris', workspace_id: 'w-1' }),
    save: jest.fn(),
    create: jest.fn(),
  }
  const accessRequests = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    create: jest.fn((row: unknown) => row),
  }
  // #2081.14 — la ligne `workspace_rules` de l'espace ; aucune ligne = défauts.
  const workspaceRules = {
    findOne: jest.fn(async () =>
      options.visibility
        ? { workspace_id: 'w-1', business_unit_accounts_visibility: options.visibility, export_policy: 'everyone' }
        : null,
    ),
  }
  const service = new BusinessUnitService(
    businessUnits as never,
    businessUnitMembers as never,
    accessRequests as never,
    workspaceMembers as never,
    workspaceRules as never,
  )
  return { service, businessUnits, businessUnitMembers, accessRequests, workspaceMembers, workspaceRules }
}

describe('GA-333 — un membre d’une BU ne voit pas les données d’une AUTRE BU du même espace', () => {
  it('la clause de périmètre arrive jusqu’à la requête, et elle NOMME les BU portées', async () => {
    const { service, qb } = buildAccountsService()

    await service.findAccountsByWorkspace('w-1', {}, null, undefined, {
      businessUnitIds: ['bu-lyon'],
      includeUnassigned: true,
    })

    expect(scopeClauses(qb)).toEqual([
      '(account.business_unit_id IN (:...businessUnitIds) OR account.business_unit_id IS NULL)',
    ])
    const params = (qb.andWhere.mock.calls as unknown[][]).find(call =>
      String(call[0]).includes('business_unit_id IN'),
    )?.[1] as { businessUnitIds: string[] }
    expect(params.businessUnitIds).toEqual(['bu-lyon'])
    expect(params.businessUnitIds).not.toContain('bu-nantes')
  })

  it('l’agrégat de portefeuille porte la MÊME clause que la liste', async () => {
    // Deux populations sous deux règles seraient deux vérités : un compteur qui
    // annonce des comptes qu'un membre cloisonné ne peut pas ouvrir.
    const { service, qb } = buildAccountsService()

    await service.listPortfolioLookups('w-1', null, { businessUnitIds: ['bu-lyon'], includeUnassigned: true })

    expect(scopeClauses(qb)).toEqual([
      '(account.business_unit_id IN (:...businessUnitIds) OR account.business_unit_id IS NULL)',
    ])
  })

  it('un membre cloisonné SANS aucun périmètre ne voit que ce que personne ne porte', async () => {
    const { service, qb } = buildAccountsService()

    await service.findAccountsByWorkspace('w-1', {}, null, undefined, {
      businessUnitIds: [],
      includeUnassigned: true,
    })

    // Surtout PAS une clause absente : « il ne porte rien » n'est pas « il voit
    // tout ». (Et `IN (:...ids)` sur un tableau vide lève côté TypeORM.)
    expect(scopeClauses(qb)).toEqual(['account.business_unit_id IS NULL'])
  })
})

/** La borne d'espace, telle qu'elle se POSE : `account.workspace_id = :param`. Une
 *  comparaison corrélée entre deux tables (`x.workspace_id = account.workspace_id`)
 *  borne une sous-requête, elle ne borne pas la liste — elle ne compte pas ici. */
const WORKSPACE_BOUNDARY = /account\.workspace_id\s*=\s*:/

describe('GA-333 — un membre d’une BU ne voit RIEN d’un autre espace', () => {
  it('la borne d’espace SURVIT à l’arrivée du filtre de périmètre', async () => {
    const { service, qb } = buildAccountsService()

    await service.findAccountsByWorkspace('w-1', {}, null, undefined, {
      businessUnitIds: ['bu-lyon'],
      includeUnassigned: true,
    })

    // La faute que ce test attrape : un `where` au lieu d'un `andWhere`, qui
    // écraserait la borne d'espace et ouvrirait toutes les ESN d'un coup.
    expect(qb.where).toHaveBeenCalledWith('account.workspace_id = :workspaceId', { workspaceId: 'w-1' })
    expect(qb.where).toHaveBeenCalledTimes(1)
    // La borne d'espace est la clause PARAMÉTRÉE `account.workspace_id = :…` — une
    // sous-requête corrélée (`cd.workspace_id = account.workspace_id`, #4526.2 « Mon
    // CRM ») n'en est pas une, et ne doit pas faire passer ce compte à 2.
    expect(allClauses(qb).filter(clause => WORKSPACE_BOUNDARY.test(clause))).toHaveLength(1)
  })

  it('les appartenances de périmètre se lisent avec l’espace ET l’utilisateur, jamais l’utilisateur seul', async () => {
    // Le cas concret : la même personne, membre de l'agence Lyon dans l'espace A
    // et cloisonnée dans l'espace B. Lire par `user_id` seul ferait entrer
    // l'identifiant de Lyon dans le filtre de B — un filtre « juste » qui
    // pointe vers un autre client.
    const { service, businessUnitMembers } = buildBusinessUnitService({
      access: 'business_unit',
      memberships: [{ business_unit_id: 'bu-lyon' }],
    })

    await service.scopeFor('w-2', 'u-1')

    expect(businessUnitMembers.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspace_id: 'w-2', user_id: 'u-1' } }),
    )
  })

  it('le membership d’espace se lit lui aussi sur le COUPLE espace + utilisateur', async () => {
    const { service, workspaceMembers } = buildBusinessUnitService({ access: 'workspace' })

    await service.scopeFor('w-2', 'u-1')

    expect(workspaceMembers.findOne).toHaveBeenCalledWith({ where: { workspace_id: 'w-2', user_id: 'u-1' } })
  })

  it('qui n’est PAS membre de cet espace est cloisonné à rien — jamais ouvert à tout', async () => {
    const { service } = buildBusinessUnitService({ membership: false })

    const scope = await service.scopeFor('w-2', 'u-etranger')

    expect(scope).not.toBeNull()
    expect(scope?.businessUnitIds).toEqual([])
  })

  it('un identifiant manquant LÈVE — il ne devient pas « pas de filtre »', async () => {
    // TypeORM IGNORE une condition `undefined` : `findOne({ where: { id:
    // undefined } })` rend la PREMIÈRE ligne. Un identifiant perdu en route
    // doit donc casser bruyamment, pas ouvrir l'espace.
    const { service } = buildBusinessUnitService({ access: 'business_unit' })

    await expect(service.scopeFor('', 'u-1')).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.scopeFor('w-1', '')).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('GA-333 — le niveau d’accès qui voit TOUT l’espace continue de tout voir', () => {
  it('sans cloisonnement, la requête ne porte AUCUNE clause de périmètre', async () => {
    const { service, qb } = buildAccountsService()

    await service.findAccountsByWorkspace('w-1', {}, null, undefined, null)

    expect(scopeClauses(qb)).toEqual([])
  })

  it('le défaut d’appel — sans le paramètre du tout — est byte-identique à avant', async () => {
    // Les appelants qui ne connaissent pas encore la dimension (API publique,
    // MCP) ne doivent rien voir changer.
    const withoutParam = buildAccountsService()
    await withoutParam.service.findAccountsByWorkspace('w-1', {}, null)

    const withNull = buildAccountsService()
    await withNull.service.findAccountsByWorkspace('w-1', {}, null, undefined, null)

    expect(allClauses(withoutParam.qb)).toEqual(allClauses(withNull.qb))
    expect(scopeClauses(withoutParam.qb)).toEqual([])
  })

  it('le niveau « workspace » ne lit MÊME PAS les appartenances — il n’y a rien à filtrer', async () => {
    const { service, businessUnitMembers } = buildBusinessUnitService({ access: 'workspace' })

    const scope = await service.scopeFor('w-1', 'u-1')

    expect(scope).toBeNull()
    expect(businessUnitMembers.find).not.toHaveBeenCalled()
  })

  it('une colonne encore vide en base (ligne d’avant migration) vaut « workspace »', async () => {
    // Le jour du déploiement, une ligne peut être lue avant que le DEFAULT ne
    // soit visible d'un cache. `null` doit valoir le comportement d'avant.
    const { service } = buildBusinessUnitService({ access: null })

    expect(await service.scopeFor('w-1', 'u-1')).toBeNull()
  })
})

describe('GA-333 — une donnée SANS BU reste visible de qui la voyait avant', () => {
  it('la clause garde sa seconde moitié : « OU rattaché à aucun périmètre »', async () => {
    const { service, qb } = buildAccountsService()

    await service.findAccountsByWorkspace('w-1', {}, null, undefined, {
      businessUnitIds: ['bu-lyon'],
      includeUnassigned: true,
    })

    expect(scopeClauses(qb)[0]).toContain('OR account.business_unit_id IS NULL')
  })

  it('les DEUX cloisonnements s’additionnent — le portefeuille ET le périmètre', async () => {
    const { service, qb } = buildAccountsService()

    await service.findAccountsByWorkspace('w-1', {}, { ownerId: 'u-1', includeUnassigned: true }, undefined, {
      businessUnitIds: ['bu-lyon'],
      includeUnassigned: true,
    })

    const clauses = allClauses(qb)
    expect(clauses.some(clause => clause.includes('assigned_to'))).toBe(true)
    expect(clauses.some(clause => clause.includes('business_unit_id'))).toBe(true)
    expect(clauses.filter(clause => WORKSPACE_BOUNDARY.test(clause))).toHaveLength(1)
  })
})

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LES QUATRE ROUTES D'ÉCRITURE DE DROITS — le trou de la première version
 * ─────────────────────────────────────────────────────────────────────────────
 * La garde d'origine prouvait que la clause de périmètre arrive bien jusqu'à la
 * REQUÊTE. Elle ne disait rien de qui a le droit de CHANGER ce périmètre — et
 * c'est là que vivaient les deux failles de la revue de sécurité du 15/09/2026,
 * toutes deux atteignables en production (`app.module.ts` monte le module).
 *
 * ⚠️ Preuve que ces tests savent dire NON — MESURÉE le 15/09/2026 : écrits
 * d'abord à l'ENVERS (« le cloisonné rejoint », « le sales_ops s'accorde
 * l'espace », « le sales_ops aveugle le propriétaire »), les trois sont passés
 * VERTS sur `origin/main` = 0ccc8961a. C'est l'exploitation, jouée, avant le
 * correctif. Retirer l'un des trois refus du service les remet au vert.
 */
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉTAIL D'UN COMPTE — « la liste cachait, le détail servait »
 * ─────────────────────────────────────────────────────────────────────────────
 * Le défaut n°3 de la revue du 15/09/2026, et le plus discret : la liste
 * filtrait par périmètre, `GET /accounts/:id` répondait quand même. Un membre
 * cloisonné à Lyon qui connaissait l'UUID d'un compte de Paris obtenait le
 * dossier entier, `raw_analysis` comprise — et l'UUID circule naturellement dès
 * qu'un écran voisin l'affiche.
 *
 * ⚠️ Preuve que ces tests savent dire NON — MESURÉE le 15/09/2026 : écrit à
 * l'ENVERS (« le détail d'un compte hors périmètre est servi », c'est-à-dire
 * SQL sans `business_unit_id` et résultat `success`), le test passait VERT sur
 * `origin/main` = 0ccc8961a.
 */
describe('GA-333 — le DÉTAIL d’un compte porte le même périmètre que la liste', () => {
  it('la clause arrive dans le SQL brut, et les identifiants passent en PARAMÈTRE', async () => {
    const { service, query } = buildAccountsService()

    await service.findOneForWorkspace('acc-paris', 'w-1', {
      businessUnitIds: ['bu-lyon'],
      includeUnassigned: true,
    })

    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('(a.business_unit_id IN (SELECT unnest($3::uuid[])) OR a.business_unit_id IS NULL)')
    // Jamais concaténé : un identifiant interpolé serait une injection, et la
    // borne d'espace vit toujours dans la MÊME requête.
    expect(sql).not.toContain('bu-lyon')
    expect(params).toEqual(['acc-paris', 'w-1', ['bu-lyon']])
    expect(sql).toContain('a.workspace_id = $2')
  })

  it('hors périmètre, la réponse est « introuvable » — jamais « interdit »', async () => {
    // 404 et non 403 : un 403 confirmerait qu'il y a bien un compte derrière cet
    // identifiant chez cette ESN. C'est la réponse que `findInWorkspace` donne
    // déjà pour un périmètre d'un autre espace.
    const { service, query } = buildAccountsService()
    query.mockResolvedValue([])

    const result = await service.findOneForWorkspace('acc-paris', 'w-1', {
      businessUnitIds: ['bu-lyon'],
      includeUnassigned: true,
    })

    expect(result.type).toBe('failure')
    expect(result.type === 'failure' && result.problem.code).toBe('not_found')
  })

  it('un membre cloisonné SANS périmètre n’ouvre que ce que personne ne porte', async () => {
    const { service, query } = buildAccountsService()

    await service.findOneForWorkspace('acc-paris', 'w-1', { businessUnitIds: [], includeUnassigned: true })

    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('a.business_unit_id IS NULL')
    expect(sql).not.toContain('$3')
    // Pas de troisième paramètre à lier : la clause n'en prend aucun.
    expect(params).toEqual(['acc-paris', 'w-1'])
  })

  it('TÉMOIN — sans périmètre, le SQL est BYTE-IDENTIQUE à celui d’avant', async () => {
    // Les 28 appelants de cette méthode qui ne passent pas encore le périmètre
    // ne doivent RIEN voir changer — c'est ce qui rend le correctif déployable.
    const sansParam = buildAccountsService()
    await sansParam.service.findOneForWorkspace('acc-1', 'w-1')

    const avecNull = buildAccountsService()
    await avecNull.service.findOneForWorkspace('acc-1', 'w-1', null)

    expect(String(sansParam.query.mock.calls[0][0])).toBe(String(avecNull.query.mock.calls[0][0]))
    expect(String(sansParam.query.mock.calls[0][0])).not.toContain('business_unit_id')
    expect(sansParam.query.mock.calls[0][1]).toEqual(['acc-1', 'w-1'])
  })

  it('la FORME de la clause est la MÊME que celle de la liste — une dérivation, un endroit', () => {
    // GA-26. Les deux dialectes diffèrent (paramètre nommé contre positionnel),
    // la règle non : mêmes trois branches, même « OU sans périmètre ». Deux
    // écritures divergeraient le jour où l'une seule est corrigée.
    const liste = businessUnitScopeClause(
      { businessUnitIds: ['bu-lyon'], includeUnassigned: true },
      'account.business_unit_id',
      ':...businessUnitIds',
    )
    const detail = businessUnitScopeClause(
      { businessUnitIds: ['bu-lyon'], includeUnassigned: true },
      'a.business_unit_id',
      'SELECT unnest($3::uuid[])',
    )

    expect(liste).toBe('(account.business_unit_id IN (:...businessUnitIds) OR account.business_unit_id IS NULL)')
    expect(detail).toBe('(a.business_unit_id IN (SELECT unnest($3::uuid[])) OR a.business_unit_id IS NULL)')
    expect(businessUnitScopeClause(null, 'a.business_unit_id', '$3')).toBeNull()
    expect(businessUnitScopeClause({ businessUnitIds: [], includeUnassigned: true }, 'a.b', '$3')).toBe('a.b IS NULL')
  })
})

describe('GA-333 — un membre cloisonné ne s’accorde pas un périmètre tout seul', () => {
  it('« rejoindre » est REFUSÉ à un cloisonné, et le refus ne dit rien de l’autre côté', async () => {
    // Le geste de l'attaquant, sans outil ni faille technique : la liste NOMME
    // toutes les BU de l'espace (par conception), il restait un POST à faire.
    const { service, businessUnitMembers } = buildBusinessUnitService({
      access: 'business_unit',
      memberships: [{ business_unit_id: 'bu-lyon' }],
    })

    await expect(service.join('w-1', 'bu-paris', 'u-lyon')).rejects.toBeInstanceOf(ForbiddenException)
    // Et rien n'est écrit : un refus qui insère quand même serait pire qu'un
    // refus absent, parce qu'on le croirait.
    expect(businessUnitMembers.save).not.toHaveBeenCalled()

    const message = await service.join('w-1', 'bu-paris', 'u-lyon').catch((error: Error) => error.message)
    // Le refus NOMME la porte à emprunter, jamais ce qu'il y a derrière : pas
    // d'effectif, pas de nombre de comptes, pas de nom de responsable.
    expect(message).toBe('business_unit_join_requires_access_request')
  })

  it('TÉMOIN — le chemin interne « demande accordée → adhésion » reste PERMIS', async () => {
    // Sans ce témoin, le correctif « sécuriserait » en cassant : le circuit
    // demande / accord / refus est exactement ce qui rend le refus ci-dessus
    // vivable.
    const { service, businessUnitMembers, accessRequests } = buildBusinessUnitService({
      access: 'business_unit',
      memberships: [{ business_unit_id: 'bu-lyon' }],
    })
    accessRequests.findOne.mockResolvedValue({
      id: 'req-1',
      workspace_id: 'w-1',
      business_unit_id: 'bu-paris',
      user_id: 'u-lyon',
      status: 'pending',
    })

    await service.decideAccessRequest('w-1', 'req-1', 'u-manager', true)

    expect(businessUnitMembers.save).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: 'w-1', business_unit_id: 'bu-paris', user_id: 'u-lyon' }),
    )
  })

  it('TÉMOIN — un membre qui voit DÉJÀ tout l’espace rejoint librement', async () => {
    // `'workspace'` n'est pas un cloisonnement : rejoindre n'y élève rien, ce
    // n'est que de la tenue de registre. Le refus ne doit pas l'attraper.
    const { service, businessUnitMembers } = buildBusinessUnitService({ access: 'workspace' })

    await service.join('w-1', 'bu-paris', 'u-1')

    expect(businessUnitMembers.save).toHaveBeenCalled()
  })

  it('TÉMOIN — rejoindre deux fois reste un no-op, jamais un refus', async () => {
    const { service, businessUnitMembers } = buildBusinessUnitService({
      access: 'business_unit',
      alreadyMember: true,
    })

    await expect(service.join('w-1', 'bu-paris', 'u-lyon')).resolves.toBeUndefined()
    expect(businessUnitMembers.save).not.toHaveBeenCalled()
  })
})

describe('GA-333 — qui règle les périmètres ne se règle pas LUI-MÊME', () => {
  it('s’accorder un accès à SOI-MÊME est refusé — les 3 rôles porteurs de team:manage compris', async () => {
    // `sales_ops` porte `team:manage` et peut être cloisonné : sans ce refus, il
    // se posait `access: 'workspace'` et annulait son propre cloisonnement.
    // C'est mot pour mot ce que le contrat interdit — « AUCUN contournement par
    // le rôle » (`packages/contracts/src/schemas/business-unit.ts`).
    const { service, workspaceMembers } = buildBusinessUnitService({ access: 'business_unit', role: 'sales_ops' })

    await expect(
      service.setMemberAccess('w-1', 'u-ops', 'u-ops', { access: 'workspace', businessUnitIds: [] }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(workspaceMembers.save).not.toHaveBeenCalled()
  })

  it('le refus d’auto-attribution tombe AVANT toute lecture — il ne confirme rien', async () => {
    const { service, workspaceMembers, businessUnits } = buildBusinessUnitService({ access: 'business_unit' })

    await service
      .setMemberAccess('w-1', 'u-ops', 'u-ops', { access: 'workspace', businessUnitIds: ['bu-paris'] })
      .catch(() => undefined)

    expect(workspaceMembers.findOne).not.toHaveBeenCalled()
    expect(businessUnits.find).not.toHaveBeenCalled()
  })

  it('le PROPRIÉTAIRE ne se fait pas cloisonner par quelqu’un d’autre', async () => {
    // Même protection que `workspace-team.service.ts` (retrait d'un membre,
    // changement de rôle) : la cible `owner` est lue, puis refusée. Sans elle,
    // un `sales_ops` posait `businessUnitIds: []` sur le propriétaire, qui ne
    // voyait plus que les comptes sans périmètre — l'aveuglement de celui qui
    // aurait pu défaire l'attaque.
    const { service, workspaceMembers } = buildBusinessUnitService({ access: 'workspace', role: 'owner' })

    await expect(
      service.setMemberAccess('w-1', 'u-ops', 'u-owner', { access: 'business_unit', businessUnitIds: [] }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(workspaceMembers.save).not.toHaveBeenCalled()
  })

  it('TÉMOIN — régler le périmètre d’un AUTRE membre non-propriétaire passe', async () => {
    // C'est le geste d'organisation légitime, et toute la raison d'être de la
    // route. Une garde qui l'attraperait aurait supprimé la fonctionnalité.
    const { service, workspaceMembers } = buildBusinessUnitService({ access: 'workspace', role: 'sales' })

    await service.setMemberAccess('w-1', 'u-manager', 'u-commercial', {
      access: 'business_unit',
      businessUnitIds: [],
    })

    expect(workspaceMembers.save).toHaveBeenCalledWith(
      expect.objectContaining({ business_unit_access: 'business_unit' }),
    )
  })

  it('un identifiant d’appelant manquant LÈVE — il ne devient pas « pas de contrôle »', async () => {
    const { service, workspaceMembers } = buildBusinessUnitService({ access: 'workspace', role: 'sales' })

    await expect(
      service.setMemberAccess('w-1', '', 'u-commercial', { access: 'workspace', businessUnitIds: [] }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(workspaceMembers.save).not.toHaveBeenCalled()
  })
})

describe('GA-333 — le corpus n’est pas vide : la garde LIT du code réel', () => {
  const MODULE = __dirname
  const ACCOUNTS = join(__dirname, '..', 'accounts')

  it('le module BU existe, avec son service, son contrôleur et son module', () => {
    const files = readdirSync(MODULE)
    for (const expected of ['business-unit.service.ts', 'business-unit.controller.ts', 'business-unit.module.ts']) {
      expect(files).toContain(expected)
    }
  })

  it('le contrôleur des comptes APPELLE réellement la résolution de périmètre', () => {
    // Le défaut n°1 de ce dépôt : du code juste que personne n'appelle. Une
    // règle d'accès jamais invoquée est une intention, pas un cloisonnement.
    const source = readFileSync(join(ACCOUNTS, 'accounts.controller.ts'), 'utf8')

    expect(source).toContain('resolveBusinessUnitScope')
    // Et il LÈVE au lieu de servir tout l'espace quand le service manque.
    expect(source).toContain('business_unit_scope_unavailable')
  })

  it('CHAQUE lecture de comptes est CLASSÉE — cloisonnée, ou hors périmètre avec sa raison ÉCRITE', () => {
    // ─────────────────────────────────────────────────────────────────────────
    // CE QUI A REMPLACÉ « au moins 3 appelants », et POURQUOI
    // ─────────────────────────────────────────────────────────────────────────
    // L'assertion d'origine exigeait `resolveBusinessUnitScope` au moins 3 fois
    // dans le contrôleur des comptes. Elle figeait le compte du jour et ne
    // disait RIEN des autres lecteurs : elle est restée VERTE pendant que cinq
    // autres appels du dépôt servaient des comptes sans la moindre clause de
    // périmètre (revue sécurité 15/09/2026, §4). Un compteur n'est pas une
    // garde — il mesure une quantité, pas une règle.
    //
    // Ce que ce test-ci vérifie, et qu'il SAIT dire : toute lecture de comptes
    // du dépôt est soit CLOISONNÉE, soit inscrite ci-dessous avec la raison
    // pour laquelle elle ne l'est pas. Un nouvel appelant — cloisonné ou non —
    // qui n'est pas classé fait ROUGIR ce test. C'est la même forme que
    // `demo-coverage` : la question doit avoir une réponse écrite.
    //
    // ⚠️ Passer une entrée de 'cloisonnée' vers une raison pour faire taire le
    // test est exactement ce qu'il interdit.
    const LECTURES_DE_COMPTES: Record<string, 'cloisonnée' | string> = {
      'accounts.controller.ts#findAll': 'cloisonnée',
      'accounts.controller.ts#resolveMarketCoveredIds': 'cloisonnée',
      'accounts.controller.ts#marketMemoryPortfolio': 'cloisonnée',
      'accounts.controller.ts#withSimilarityHeadlines':
        "hors périmètre — décision produit posée à Louis le 15/09/2026, non tranchée : c'est un enrichissement de libellés, pas une porte d'ouverture de compte",
      'ia-proxy.controller.ts#readMarketPortfolio':
        'hors périmètre — décision produit posée à Louis le 15/09/2026, non tranchée',
      'v1.controller.ts#listAccounts':
        "hors périmètre ASSUMÉ — l'API publique s'authentifie par clé d'ESPACE, pas par personne : il n'y a pas de membre dont lire le périmètre",
      'copilot-bridge.controller.ts#marketSearchPortfolio':
        'hors périmètre — décision produit posée à Louis le 15/09/2026, non tranchée',
      // #2288.2 — LA MÊME lecture que la ligne du dessus, au mot près : le
      // portefeuille sert à savoir QUELS comptes de l'appelant sont les
      // entreprises trouvées, pour dater leur signal. Elle hérite donc de la
      // MÊME question non tranchée, et pas d'une raison écrite pour elle —
      // écrire ici une justification propre ferait croire que la question a
      // été retranchée alors qu'elle est la même, ouverte depuis le 15/09.
      'companies.controller.ts#marketSearchPortfolio':
        'hors périmètre — décision produit posée à Louis le 15/09/2026, non tranchée',
      'mcp-api.controller.ts#listAccounts':
        'hors périmètre — décision produit posée à Louis le 15/09/2026, non tranchée',
      // #2148.4 (#2848) — pont « réutiliser avant de rechercher » pour Laura,
      // même construction que `copilot-contacts-search.controller.ts` (#2294) :
      // `resolveBusinessUnitScope` EST appelé et sa valeur transmise à
      // `findAccountsByWorkspace`.
      'copilot-accounts-search.controller.ts#search': 'cloisonnée',
      // #3258.13 (épopée #3362, lot P01) — même cloisonnement que
      // `marketMemoryPortfolio` juste au-dessus : `resolveBusinessUnitScope`
      // ET `businessUnitScope` sont bien passés à `listPortfolioLookups`.
      'accounts.controller.ts#interestPenetrabilityPortfolio': 'cloisonnée',
      // Signaux/opportunités MCP : `resolveBusinessUnitScope` résolu puis transmis à
      // `findAccountsByWorkspace` — le portefeuille lu est celui du périmètre de l'appelant.
      'mcp-api.controller.ts#signalsContext': 'cloisonnée',
      // Lot 764 — GET /accounts/signal-history : `resolveBusinessUnitScope` résolu puis transmis à
      // `signalLines.forWorkspace`, qui le pose sur la SEULE lecture qui nomme les comptes
      // (`account-signal-lines.service.spec.ts` › « cloisonnement »).
      'accounts.controller.ts#signalHistory': 'cloisonnée',
    }

    const MODULES = join(__dirname, '..')
    // Lot 764 — l'Historique de l'espace NOMME ses comptes (`signalLines.forWorkspace`) : un lecteur de comptes.
    const LECTEURS = /\.(findAccountsByWorkspace|listPortfolioLookups)\(|signalLines\.forWorkspace\(/
    const trouvees: Record<string, boolean> = {}

    for (const moduleDir of readdirSync(MODULES, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
      const dir = join(MODULES, moduleDir.name)
      for (const file of readdirSync(dir).filter(name => name.endsWith('.controller.ts'))) {
        const lines = readFileSync(join(dir, file), 'utf8').split('\n')
        lines.forEach((line, index) => {
          if (!LECTEURS.test(line)) return
          // La méthode ENGLOBANTE, pas le numéro de ligne : un numéro dérive au
          // premier commentaire ajouté, et la garde deviendrait du bruit.
          let method = '?'
          for (let cursor = index; cursor >= 0; cursor--) {
            const declaration = lines[cursor].match(
              /^ {2}(?:private |public |protected )?(?:async )?([A-Za-z0-9_]+)\s*\(/,
            )
            if (declaration) {
              method = declaration[1]
              break
            }
          }
          trouvees[`${file}#${method}`] = /businessUnitScope|resolveBusinessUnitScope/.test(
            lines.slice(index, index + 8).join(' '),
          )
        })
      }
    }

    // Le corpus n'est pas vide — sinon ce test rendrait un vert qui ne lit rien.
    expect(Object.keys(trouvees).length).toBeGreaterThanOrEqual(8)

    for (const [site, cloisonnee] of Object.entries(trouvees)) {
      const classement = LECTURES_DE_COMPTES[site]
      // Un lecteur non classé : la garde NOMME le site, pour que la réponse
      // s'écrive ici plutôt que de se deviner.
      expect(`${site} → ${classement ?? 'NON CLASSÉ'}`).not.toContain('NON CLASSÉ')
      if (classement === 'cloisonnée') {
        expect(`${site} porte le périmètre : ${cloisonnee}`).toBe(`${site} porte le périmètre : true`)
      } else {
        // Et l'inverse compte autant : une lecture devenue cloisonnée doit
        // QUITTER la liste des exceptions, sinon la liste ment.
        expect(`${site} porte le périmètre : ${cloisonnee}`).toBe(`${site} porte le périmètre : false`)
        expect((classement ?? '').length).toBeGreaterThan(30)
      }
    }
    // Aucune exception fantôme : une entrée qui ne désigne plus rien se retire.
    for (const site of Object.keys(LECTURES_DE_COMPTES)) {
      expect(`${site} existe : ${site in trouvees}`).toBe(`${site} existe : true`)
    }
  })

  it('CHAQUE ouverture d’un compte par son id est CLASSÉE — cloisonnée, ou exception ÉCRITE', () => {
    // ─────────────────────────────────────────────────────────────────────────
    // POURQUOI CE TEST, ET PAS UN COMPTEUR
    // ─────────────────────────────────────────────────────────────────────────
    // `findOneForWorkspace` est LE point de passage des routes qui ouvrent un
    // compte : le dossier, ses sous-routes, les exports, les comptes rendus, le
    // MCP. Le 15/09/2026 il ne portait QUE la borne d'espace — la liste cachait
    // les comptes d'une autre agence, et le détail les servait à qui connaissait
    // l'UUID, `raw_analysis` comprise.
    //
    // Un compteur d'appelants ne dirait rien de ce trou : il resterait vert. Ce
    // test-ci exige que CHAQUE site soit classé — cloisonné, ou exception dont
    // la raison est écrite. Un appelant nouveau fait ROUGIR jusqu'à ce que la
    // question ait une réponse.
    const OUVERTURES_DE_COMPTE: Record<string, 'cloisonnée' | string> = {
      'account-favorites.controller.ts#assertVisible': 'cloisonnée',
      // FUSION VAGUE 14 — la PORTE des routes de fragment (`:id/timeline`,
      // `:id/similar`, `:id/branches`, `:id/links`, `:id/first-euro`,
      // `:id/intelligence-context`). Elles ouvraient chacune le compte en
      // ligne ; la lecture vit maintenant à UN endroit, gardée par GA-335.
      'accounts.controller.ts#assertAccountInScope': 'cloisonnée',
      'accounts.controller.ts#changeDigest': 'cloisonnée',
      // #4609.3 (vague O) puis #4786 (29/10/2026) — TRANCHÉ, et c'est devenu une
      // ligne `cloisonnée` comme les autres. Cette entrée portait l'aveu « le
      // compte cible d'une fusion est lu par espace seulement — à trancher par
      // Louis » : la garde avait vu juste et l'a écrit. Louis a tranché le
      // 29/10 — on retire l'exception, on porte le périmètre. `getAccountLinks`
      // passe désormais `businessUnitScope` à SES DEUX lectures (le compte et la
      // cible de `merged_into_id`), et la liste des rattachés porte la même
      // clause. Preuve du refus : `accounts.detach.service.spec.ts` ›
      // « getAccountLinks — le périmètre Business Unit (#4786, GA-336) ».
      'accounts.service.ts#getAccountLinks': 'cloisonnée',
      // #4180 (lot V10-C) — « Même verdict depuis le … » ouvre le compte par `findOneForWorkspace` + périmètre.
      'accounts.controller.ts#verdictUnchanged': 'cloisonnée',
      // #3212.6 — la révision de verdict ouvre le compte par findOneForWorkspace + périmètre.
      'accounts.controller.ts#verdictRevision': 'cloisonnée',
      // #2809 (V34) — la découverte de contacts ouvre chaque compte par findOneForWorkspace + périmètre.
      'contact-discovery.controller.ts#resolveAccounts': 'cloisonnée',
      'contact-discovery.controller.ts#run': 'cloisonnée',
      'accounts.controller.ts#classifyContacts': 'cloisonnée',
      'accounts.controller.ts#createContactFromCrm': 'cloisonnée',
      'accounts.controller.ts#createShareLink': 'cloisonnée',
      'accounts.controller.ts#findOne': 'cloisonnée',
      'accounts.controller.ts#getCost': 'cloisonnée',
      'accounts.controller.ts#getProfileProvenance': 'cloisonnée',
      'accounts.controller.ts#importContacts': 'cloisonnée',
      'accounts.controller.ts#importContactsCsv': 'cloisonnée',
      // #2556.2 — GET /accounts/:id/known-movements. Le compte s'ouvre par la
      // MÊME porte que le reste : `findOneForWorkspace(id, workspaceId,
      // businessUnitScope)`. Un compte hors du périmètre du membre rend 404
      // avant qu'aucun mouvement ne soit lu.
      'accounts.controller.ts#knownMovements': 'cloisonnée',
      // #2871 — GET /accounts/:id/actions, le plan du compte au contrat
      // canonique. Même porte (`findOneForWorkspace(id, workspaceId,
      // businessUnitScope)`) : hors périmètre, 404 avant qu'aucune ligne du
      // plan ne soit lue (`accounts.canonical-actions.spec.ts`).
      'accounts.controller.ts#listCanonicalActions': 'cloisonnée',
      'accounts.controller.ts#listRuns': 'cloisonnée',
      'accounts.controller.ts#marketContext': 'cloisonnée',
      // #5192 (lot 781) — GET /accounts/:id/market-paths : le compte s'ouvre par `findOneForWorkspace(id, workspaceId, businessUnitScope)`, hors périmètre = 404 avant toute lecture (`accounts.market-paths-detail.spec.ts`).
      'accounts.controller.ts#marketPaths': 'cloisonnée',
      // #4742 — GET /accounts/:id/tech-structure : le compte s'ouvre par `findOneForWorkspace(id, workspaceId, businessUnitScope)`, hors périmètre = 404 avant toute lecture.
      'accounts.controller.ts#techStructure': 'cloisonnée',
      'accounts.controller.ts#signalLinesOf': 'cloisonnée',
      // #3916.b (lot M03, 09/10) — les annonces de registre du compte, ouvert par `findOneForWorkspace` avec son périmètre.
      'accounts.controller.ts#registryAnnouncements': 'cloisonnée',
      // #3970 (lot P07, 09/10) — les recrutements récents du compte, ouvert par `findOneForWorkspace` avec son périmètre.
      'accounts.controller.ts#recentHires': 'cloisonnée',
      // Louis 30/10 — les offres du compte par métier saisi, ouvert par `findOneForWorkspace` avec son périmètre.
      'accounts.controller.ts#jobOffers': 'cloisonnée',
      // #3282 (lot RAC, 10/10) — le niveau d'entrée du comité : le compte s'ouvre par `findOneForWorkspace` avec son périmètre, en lecture comme en écriture.
      'accounts.controller.ts#getCommitteeEntryLevel': 'cloisonnée',
      'accounts.controller.ts#setCommitteeEntryLevel': 'cloisonnée',
      'accounts.controller.ts#recordMarketResolution': 'cloisonnée',
      'accounts.controller.ts#setCommercialStatus': 'cloisonnée',
      'accounts.controller.ts#setBestReference': 'cloisonnée',
      'accounts.controller.ts#setBetProfile': 'cloisonnée',
      'accounts.controller.ts#getBetProfile': 'cloisonnée',
      'accounts.controller.ts#setRelationshipMemory': 'cloisonnée',
      'analysis.controller.ts#listVocabulary': 'cloisonnée',
      // #2452 — le devis d'approfondissement ouvre chaque compte ciblé par la
      // MÊME porte que le reste de ce contrôleur : `findOneForWorkspace` avec
      // `scope.businessUnitScope` résolu au bord (repli `findOne` propriétaire
      // si le compte n'est pas dans le périmètre — jamais plus large).
      'analysis.controller.ts#deepenQuote': 'cloisonnée',
      // FUSION VAGUE 16 (#2710) — la salle temps réel d'une analyse
      // (`join`/`mayWatch`) ouvrait le compte sur la seule borne d'espace :
      // un membre cloisonné sur une autre unité pouvait suivre en direct la
      // progression d'un compte que le chemin HTTP lui refusait déjà. Elle
      // porte maintenant la MÊME requête que le reste : `findOneForWorkspace`
      // avec `businessUnitScope` résolu par `resolveBusinessUnitScope`.
      'analysis.gateway.ts#mayWatch': 'cloisonnée',
      // FUSION VAGUE 15 — DÉFAUT D'INTÉGRATION mesuré à la fusion (22/09) :
      // l'analyse-à-deux (`findAccountForCaller`) n'avait pas classé son
      // propre appelant. Le compte s'ouvre par `findOneForWorkspace(accountId,
      // scope.workspaceId, scope.businessUnitScope)` quand un périmètre est
      // fourni ; sans lui, replie sur `findOne` (propriétaire), STRICTEMENT
      // plus étroit — jamais plus large.
      'analysis.service.ts#findAccountForCaller': 'cloisonnée',
      'coverage.controller.ts#getCoverageGaps': 'cloisonnée',
      'documents.service.ts#requireAccount': 'cloisonnée',
      // #2284.65/.67-.69 — la porte d'espace ET de périmètre AVANT toute
      // lecture/écriture de correction d'entité : MÊME requête que le reste
      // (`findOneForWorkspace` + `resolveBusinessUnitScope`), un compte hors
      // périmètre rend 404 avant qu'aucune correction ne soit lue ou écrite.
      'entity-resolution-corrections.controller.ts#visibleWorkspace': 'cloisonnée',
      'mcp-api.controller.ts#askAccount': 'cloisonnée',
      'mcp-api.controller.ts#createAction': 'cloisonnée',
      'mcp-api.controller.ts#getAccount': 'cloisonnée',
      // #2985 (revue manager, mesuré à l'intégration chantier A du 26/09) —
      // MÊME construction que `copilot-accounts-search.controller.ts#search` :
      // `resolveBusinessUnitScope(this.businessUnits, workspaceId, dto.userId)`
      // résolu et transmis à `findOneForWorkspace`.
      'copilot-bridge.controller.ts#accountManagerReview': 'cloisonnée',
      // #3919 (lot Y10, intégration X 08/10) — `accountSignals` : MÊME construction,
      // `resolveBusinessUnitScope(...)` résolu puis transmis à `findOneForWorkspace`.
      'copilot-bridge.controller.ts#accountSignals': 'cloisonnée',
      'meeting-notes.service.ts#structure': 'cloisonnée',
      // #2777 — la résolution du nom de compte avant de proposer un Deal au
      // CRM porte le MÊME périmètre que `structure()` : `businessUnitScope`
      // résolu par le contrôleur (`businessUnitScopeIfAvailable`, best-effort
      // pour ne pas rompre les six autres sorties du lot).
      'meeting-notes.service.ts#proposeOpportunity': 'cloisonnée',
      // Import universel (Louis 27/09/2026) — MÊME droit que
      // `POST /accounts/:id/contacts/bulk` : `resolveBusinessUnitScope` résolu
      // au bord et transmis à `findOneForWorkspace` avant tout rattachement
      // d'un job d'import à un compte ciblé par id.
      'universal-import.controller.ts#create': 'cloisonnée',
      // #2927 — « Mes contacts personnels » d'un compte : MÊME droit d'ouverture (espace ET unité) avant de lire,
      // puis lecture bornée à `user_id` côté service.
      'universal-import.controller.ts#personalContacts': 'cloisonnée',
      // #4267 — suivre un compte ouvre le compte sous le périmètre BU (404 hors périmètre).
      'account-follows.controller.ts#follow': 'cloisonnée',
      // #4421.15-.18 (25/10, vagues VII ET VIII — les deux lots « Obtenir l'e-mail » ont inscrit la
      // MÊME surface ici ; une seule entrée, la clé ne se duplique pas) — révéler une personne hors
      // fiche ouvre le compte par la MÊME porte que le reste :
      // `findOneForWorkspace(id, workspaceId, resolveBusinessUnitScope(…))`.
      // Hors périmètre, 404 avant qu'aucun contact ne soit créé ni aucun enrichissement payé.
      'outside-person-reveal.controller.ts#resolveAccount': 'cloisonnée',
      // #4180 (14/10) — « ce qui a changé depuis la dernière vérification » ouvre le compte sous le périmètre.
      'accounts.controller.ts#changesSinceCheck': 'cloisonnée',
      // #4158 EX-03 (w6, 15/10) — les entités du groupe d'un compte, lues sous le périmètre du membre.
      'accounts.controller.ts#groupEntities': 'cloisonnée',
      // Les TROIS exceptions, et aucune autre.
      'ia-proxy.controller.ts#readScopeObject':
        "appel INTERNE de service à service (secret partagé, aucune session) : il n'y a aucun membre dont lire le périmètre, et la borne d'espace reste posée",
      // #2434.33 — contexte UTILISATEUR normal (session, `workspaceId` résolu),
      // mais ce contrôleur ne câble aucun `BusinessUnitScopeService` — même
      // trou que `readScopeObject`, pas le même mécanisme (là : aucune session ;
      // ici : le résolveur n'est simplement pas encore branché sur cette
      // surface). Un compte hors espace ou introuvable rend un résultat VIDE,
      // jamais une erreur : l'indice de nom propre ne s'affiche pas, il ne fuit
      // rien sur un compte que le périmètre exclurait.
      // DATA-C (15/10) — l'ouverture a quitté `voiceTranscriptionPrompt` pour `voiceVocabulary`,
      // qui sert la même liste de noms aux deux voies (`prompt` OpenAI, `context_bias` Voxtral).
      'ia-proxy.controller.ts#voiceVocabulary':
        "l'indice de noms propres pour la dictée vocale (#2434.33) : contexte utilisateur normal mais BusinessUnitScopeService non câblé sur cette surface — même trou que readScopeObject, résultat vide plutôt qu'une erreur pour un compte hors périmètre",
      'public-api.service.ts#getAccount':
        "l'API publique s'authentifie par clé d'ESPACE et non par personne : il n'y a pas de membre dont lire le périmètre — le cloisonnement d'espace, lui, tient",
    }

    const MODULES = join(__dirname, '..')
    const trouvees: Record<string, boolean> = {}
    for (const entry of readdirSync(MODULES, { withFileTypes: true }).filter(row => row.isDirectory())) {
      const dir = join(MODULES, entry.name)
      for (const file of readdirSync(dir).filter(name => name.endsWith('.ts') && !name.endsWith('.spec.ts'))) {
        const lines = readFileSync(join(dir, file), 'utf8').split('\n')
        lines.forEach((line, index) => {
          if (!line.includes('.findOneForWorkspace(')) return
          // La méthode ENGLOBANTE, pas le numéro de ligne : un numéro dérive au
          // premier commentaire ajouté, et la garde deviendrait du bruit.
          let method = '?'
          for (let cursor = index; cursor >= 0; cursor--) {
            const declaration = lines[cursor].match(
              /^ {2}(?:private |public |protected )?(?:async )?([A-Za-z0-9_]+)\s*\(/,
            )
            if (declaration) {
              method = declaration[1]
              break
            }
          }
          trouvees[`${file}#${method}`] = /businessUnitScope|resolveBusinessUnitScope/.test(
            lines.slice(index, index + 9).join(' '),
          )
        })
      }
    }

    // Le corpus n'est pas vide — sinon ce test rendrait un vert qui ne lit rien.
    expect(Object.keys(trouvees).length).toBeGreaterThanOrEqual(25)

    for (const [site, cloisonnee] of Object.entries(trouvees)) {
      const classement = OUVERTURES_DE_COMPTE[site]
      // Un site non classé : la garde le NOMME, pour que la réponse s'écrive ici
      // plutôt que de se deviner.
      expect(`${site} → ${classement ?? 'NON CLASSÉ'}`).not.toContain('NON CLASSÉ')
      const attendu = classement === 'cloisonnée'
      expect(`${site} porte le périmètre : ${cloisonnee}`).toBe(`${site} porte le périmètre : ${attendu}`)
      // Une exception sans raison écrite n'est pas une exception.
      if (!attendu) expect((classement ?? '').length).toBeGreaterThan(40)
    }
    // Aucune entrée fantôme : une ligne qui ne désigne plus rien se retire.
    for (const site of Object.keys(OUVERTURES_DE_COMPTE)) {
      expect(`${site} existe : ${site in trouvees}`).toBe(`${site} existe : true`)
    }
  })

  it('les CONTACTS héritent du périmètre de LEUR COMPTE — lectures cloisonnées, écritures plus étroites', () => {
    // « Un dossier de compte cloisonné dont les contacts ne le sont pas ne
    // cloisonne rien » (décision Louis, 15/09/2026). La table `contacts` ne
    // porte PAS de `business_unit_id` : le périmètre d'un contact est celui de
    // SON COMPTE, lu par sous-requête. Dupliquer la colonne créerait deux
    // vérités à synchroniser, et le jour où elles divergent c'est le
    // cloisonnement qui perd.
    const service = readFileSync(join(__dirname, '..', 'contacts', 'contacts.service.ts'), 'utf8')
    const controller = readFileSync(join(__dirname, '..', 'contacts', 'contacts.controller.ts'), 'utf8')

    // La sous-requête, et sa seconde moitié : un contact SANS compte reste
    // visible. ⚠️ Le contact a TROIS dialectes — `Raw` pour les lectures par
    // id, QueryBuilder pour la liste, SQL positionnel pour les compteurs — et
    // la première version de cette garde ne vérifiait qu'UNE occurrence de
    // « OU sans compte » : retirée de la liste, elle restait VERTE parce que
    // les deux autres la portaient encore. Les trois sont donc nommées.
    expect((service.match(/SELECT bu_acc\.id FROM accounts bu_acc WHERE/g) ?? []).length).toBeGreaterThanOrEqual(3)
    for (const moitie of [
      // `Raw` — les lectures d'un contact par son id
      '`(${alias} IS NULL OR ${alias} IN (SELECT bu_acc.id FROM accounts bu_acc WHERE ${clause}))`',
      // QueryBuilder — la liste
      '(contact.account_id IS NULL OR contact.account_id IN (SELECT bu_acc.id FROM accounts bu_acc WHERE ',
      // SQL positionnel — les compteurs
      'AND (account_id IS NULL OR account_id IN (SELECT bu_acc.id FROM accounts bu_acc WHERE ',
    ]) {
      expect(`« OU sans compte » présent : ${service.includes(moitie)}`).toBe('« OU sans compte » présent : true')
    }
    // Et la FORME vient du seul endroit qui la porte (GA-26).
    expect(service).toContain('businessUnitScopeClause(')

    // ⚠️ GA-07 : le périmètre est RÉSOLU PAR LE CONTRÔLEUR et descend en
    // paramètre. Le service n'importe PAS `BusinessUnitService` — sinon le
    // cliquet des imports service → service monterait, et la garde des
    // frontières de modules dit où va l'orchestration : « dans le contrôleur,
    // c'est là que vit un geste utilisateur ».
    expect(service).not.toContain("from '../business-unit/business-unit.service'")
    expect(controller).toContain("from '../business-unit/business-unit.service'")

    // Les huit LECTURES d'espace le portent toutes.
    expect((controller.match(/await this\.businessUnitScopeOf\(user\.userId\)/g) ?? []).length).toBeGreaterThanOrEqual(
      8,
    )

    // TÉMOIN — les ÉCRITURES ne portent PAS cette clause, et c'est JUSTE :
    // elles sont bornées `{ id, user_id }`, strictement PLUS étroit qu'un
    // périmètre. Leur en ajouter une donnerait l'illusion d'un contrôle là où il
    // y en a déjà un meilleur.
    expect(service).toContain('user_id: userId')
  })

  it('les QUATRE routes d’écriture de droits sont réellement branchées sur un contrôle', () => {
    // Les deux failles du 15/09 étaient invisibles à cette garde : elle ne
    // lisait que les LECTURES. Une règle d'accès qui n'est pas appelée depuis
    // la route qu'elle protège est une intention.
    const service = readFileSync(join(MODULE, 'business-unit.service.ts'), 'utf8')
    const controller = readFileSync(join(MODULE, 'business-unit.controller.ts'), 'utf8')

    // `join` connaît l'INTENTION, et `decideAccessRequest` est le seul à
    // pouvoir passer celle qui ouvre.
    expect(service).toContain("via: 'self' | 'granted' = 'self'")
    expect(service).toContain('business_unit_join_requires_access_request')
    expect(service.match(/this\.join\([^)]*'granted'\)/g)?.length ?? 0).toBe(1)

    // L'identité de l'appelant DESCEND jusqu'au service : c'est elle qui
    // manquait, et sans elle aucun des deux refus n'est calculable.
    expect(controller).toContain('setMemberAccess(workspaceId, user.userId, targetUserId, body)')
    expect(service).toContain('business_unit_access_self_change_forbidden')
    expect(service).toContain('business_unit_access_owner_forbidden')

    // Et les refus ne fuient rien de l'autre côté : aucun message ne nomme un
    // effectif, un compte ou un responsable.
    for (const code of [
      'business_unit_join_requires_access_request',
      'business_unit_access_self_change_forbidden',
      'business_unit_access_owner_forbidden',
    ]) {
      expect(code).not.toMatch(/count|name|total|member_list/)
    }
  })

  // #2017.18 — « en créer une : seulement si le rôle le permet ». La création
  // d'un périmètre (`POST /business-units`) est le seul geste d'écriture de ce
  // module qui n'avait ENCORE aucun test NOMMÉ liant sa route à `team:manage` —
  // ce test SAIT DIRE NON : retirer `@RequirePermission('team:manage')` de
  // `create`, ou l'attacher à une autre méthode, le fait rougir.
  it('un non-admin ne crée pas de BU — POST /business-units est bornée à team:manage', () => {
    const controller = readFileSync(join(MODULE, 'business-unit.controller.ts'), 'utf8')

    // La décoration doit précéder IMMÉDIATEMENT la méthode `create`, pas une
    // autre route du même contrôleur.
    expect(controller).toContain("@RequirePermission('team:manage')\n  async create(")

    // Et la permission elle-même refuse bien les rôles SANS `team:manage` —
    // la même fonction que lit le sous-écran onboarding
    // (`OnboardingBusinessUnitStep.tsx`) pour masquer « En créer un autre ».
    for (const role of ['member', 'sales', 'viewer'] as const) {
      expect(hasPermission(role, 'team:manage')).toBe(false)
    }
    for (const role of ['owner', 'admin', 'sales_ops'] as const) {
      expect(hasPermission(role, 'team:manage')).toBe(true)
    }
  })

  it('aucune route du module BU ne reçoit un workspaceId du client', () => {
    // La seule forme non contournable : l'espace vient du jeton.
    const source = readFileSync(join(MODULE, 'business-unit.controller.ts'), 'utf8')

    expect(source).not.toMatch(/@Param\(\s*'workspaceId'/)
    expect(source).not.toMatch(/@Query\(\s*'workspaceId'/)
    expect(source.match(/resolveActiveWorkspace\(/g)?.length ?? 0).toBeGreaterThanOrEqual(8)
  })

  it('le service ne lit jamais une table de périmètre sans borner l’espace', () => {
    const source = readFileSync(join(MODULE, 'business-unit.service.ts'), 'utf8')
    const wheres = source.match(/where: \{[^}]*\}/g) ?? []

    expect(wheres.length).toBeGreaterThanOrEqual(6)
    for (const clause of wheres) {
      expect(clause).toContain('workspace_id')
    }
  })

  it('… y compris quand la requête s’écrit en QueryBuilder, que l’objet littéral ne voit pas', () => {
    // L'angle mort de la première version : le test ci-dessus ne connaît que la
    // forme `where: { … }`. Une lecture écrite en `createQueryBuilder().where()`
    // lui échappait entièrement — et `create()` en contient déjà une, correcte
    // par chance et non par garde (revue sécurité 15/09/2026).
    const source = readFileSync(join(MODULE, 'business-unit.service.ts'), 'utf8')
    const chaines = source.split('createQueryBuilder(').slice(1)

    expect(chaines.length).toBeGreaterThanOrEqual(1)
    for (const chaine of chaines) {
      // Jusqu'à l'exécution de la requête : c'est là que les clauses vivent.
      const jusquAuGet = chaine.split(/\.get(?:One|Many|Count|RawMany|ManyAndCount)\(/)[0]
      expect(jusquAuGet).toContain('workspace_id')
    }
  })
})

// #2259.30 / #2259.32 / #2259.33 / #2259.34 / #2259.35 — les FICHES des BU
// portées, pour le contexte envoyé à Laura. Même risque n°1 que tout le
// reste de ce fichier : un identifiant de BU d'un AUTRE espace ne doit rendre
// AUCUNE fiche.
describe('GA-333 — les fiches de BU envoyées à Laura restent bornées à l’espace', () => {
  it('findByIds lit workspace_id ET la liste d’ids, jamais l’id seul', async () => {
    const { service, businessUnits } = buildBusinessUnitService({})
    businessUnits.find.mockResolvedValue([
      { id: 'bu-lyon', name: 'Agence Lyon', territory: 'AURA', specialties: ['Java'] },
    ])

    const rows = await service.findByIds('w-1', ['bu-lyon'])

    expect(businessUnits.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspace_id: 'w-1' }) }),
    )
    // #3384.1 — la couche BU déclarée voyage avec la fiche ; non déclarée ⇒ `null`, jamais 0.
    expect(rows).toEqual([
      {
        id: 'bu-lyon',
        name: 'Agence Lyon',
        territory: 'AURA',
        specialties: ['Java'],
        teamSize: null,
        consultantCount: null,
        capacityAvailableConsultants: null,
        quarterObjective: null,
      },
    ])
  })

  it('#3384.1 — findByIds rend effectif, consultants, consultants disponibles et objectif DÉCLARÉS', async () => {
    const { service, businessUnits } = buildBusinessUnitService({})
    businessUnits.find.mockResolvedValue([
      {
        id: 'bu-lyon',
        name: 'Agence Lyon',
        territory: null,
        specialties: [],
        team_size: 6,
        consultant_count: 40,
        capacity_available_consultants: 8,
        quarter_objective: 'Doubler la banque',
      },
    ])
    const [row] = await service.findByIds('w-1', ['bu-lyon'])
    expect(row).toMatchObject({
      teamSize: 6,
      consultantCount: 40,
      capacityAvailableConsultants: 8,
      quarterObjective: 'Doubler la banque',
    })
  })

  it('une liste vide ne déclenche aucune lecture — jamais un IN() vide qui lève côté TypeORM', async () => {
    const { service, businessUnits } = buildBusinessUnitService({})

    const rows = await service.findByIds('w-1', [])

    expect(rows).toEqual([])
    expect(businessUnits.find).not.toHaveBeenCalled()
  })

  it('un workspaceId vide ne rend rien — jamais « pas de filtre »', async () => {
    const { service, businessUnits } = buildBusinessUnitService({})

    const rows = await service.findByIds('', ['bu-lyon'])

    expect(rows).toEqual([])
    expect(businessUnits.find).not.toHaveBeenCalled()
  })
})

/**
 * #2081.14 — LA RÈGLE D'ESPACE PRIME SUR LE RÉGLAGE INDIVIDUEL (DÉCISION Louis
 * 19/09/2026). « Comptes d'une unité : privés » fait de « tout l'espace » un
 * « mes unités » pour tout siège qui n'est pas administrateur. Lue par
 * `scopeFor` — l'endroit qui décide pour TOUTES les listes et le détail d'un
 * compte —, jamais seulement cachée côté web.
 */
describe('#2081.14 — la visibilité des comptes d’une unité est une règle d’espace', () => {
  const lyon = [{ business_unit_id: 'bu-lyon' }]

  it('NON : « privée » l’emporte sur un réglage individuel « tout l’espace » contraire', async () => {
    const { service, workspaceRules } = buildBusinessUnitService({
      access: 'workspace',
      role: 'sales',
      memberships: lyon,
      visibility: 'private',
    })

    const scope = await service.scopeFor('w-1', 'u-1')

    expect(scope).toEqual({ businessUnitIds: ['bu-lyon'], includeUnassigned: true })
    // La règle lue est celle de CET espace, jamais une ligne sans borne.
    expect(workspaceRules.findOne).toHaveBeenCalledWith({ where: { workspace_id: 'w-1' } })
  })

  it('« partagée » (le défaut) : le réglage individuel décide, comme avant', async () => {
    const { service } = buildBusinessUnitService({ access: 'workspace', role: 'sales', memberships: lyon })

    expect(await service.scopeFor('w-1', 'u-1')).toBeNull()
  })

  it('l’administrateur, qui pose la règle, garde son réglage', async () => {
    const { service } = buildBusinessUnitService({
      access: 'workspace',
      role: 'admin',
      memberships: lyon,
      visibility: 'private',
    })

    expect(await service.scopeFor('w-1', 'u-1')).toBeNull()
  })

  it('l’écran NOMME le niveau qui s’applique, règle comprise (#2081.21)', async () => {
    const { service } = buildBusinessUnitService({ access: 'workspace', role: 'sales', visibility: 'private' })

    expect(await service.accessOf('w-1', 'u-1')).toBe('business_unit')
  })

  it('NON : sous « privée », on ne rejoint pas une unité par POST — on demande l’accès', async () => {
    const { service, businessUnitMembers } = buildBusinessUnitService({
      access: 'workspace',
      role: 'sales',
      visibility: 'private',
    })

    await expect(service.join('w-1', 'bu-paris', 'u-1')).rejects.toThrow('business_unit_join_requires_access_request')
    expect(businessUnitMembers.save).not.toHaveBeenCalled()
  })
})

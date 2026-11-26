import { isFailure, isSuccess } from '@bellum/utils'
import { AccountsService } from '../accounts/accounts.service'

/**
 * GA-334 — LE CLOISONNEMENT DE PÉRIMÈTRE TIENT AUSSI SUR LA FICHE (R15N-16).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE FICHIER RÉPARE
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré le 15/09/2026 en suivant les APPELANTS après la fusion de #2236 : le
 * périmètre BU était résolu à DEUX endroits — la liste des comptes et l'agrégat
 * de portefeuille — et nulle part ailleurs. `GET /accounts/:id` lisait par
 * `findOneForWorkspace(id, workspaceId)`, dont la signature ne prenait aucun
 * périmètre.
 *
 * Conséquence : un membre en `business_unit_access = 'business_unit'` ne voyait
 * pas un compte hors de ses périmètres DANS SA LISTE, mais pouvait l'OUVRIR par
 * son URL directe. Un cloisonnement qui tient sur la liste et tombe sur la
 * fiche est pire qu'un cloisonnement absent : il donne la sensation d'être
 * protégé.
 *
 * Ce n'était pas une fuite active — `business_unit_access` vaut `'workspace'`
 * pour tout le monde à cette heure, donc la dimension est inerte. Le trou
 * s'ouvrait au premier `'business_unit'` posé, et ce geste-là n'a pas l'air
 * risqué.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ PREUVE QUE CES TESTS SAVENT DIRE NON — MESURÉE LE 15/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois cassures volontaires du code protégé, compte de rouges relevé à chaque
 * fois (la mesure est reportée dans le rapport du lot) :
 *  · clause de périmètre retirée de `findOneForWorkspace`          → 4 rouges ;
 *  · `WHERE` de périmètre à la place du `AND` (borne d'espace tuée) → 2 rouges ;
 *  · clause sans « OU rattaché à aucun périmètre »                 → 2 rouges.
 *
 * Et deux TÉMOINS ci-dessous prouvent que la garde n'attrape pas ce qu'elle ne
 * vise pas : le niveau `'workspace'` reste byte-identique, et la lecture par
 * utilisateur (`findOne`) n'est pas touchée.
 */

/** Le dépôt minimal que `findOneForWorkspace` touche : `manager.query`. */
const buildAccountsService = (rows: unknown[] = []) => {
  const query = jest.fn().mockResolvedValue(rows)
  const accounts = { manager: { query }, createQueryBuilder: jest.fn() }
  return { service: new AccountsService(accounts as never, {} as never, {} as never, {} as never), query }
}

const lastCall = (query: jest.Mock): [string, unknown[]] => query.mock.calls[0] as [string, unknown[]]

const SCOPE_LYON = { businessUnitIds: ['bu-lyon'], includeUnassigned: true } as const

describe('GA-334 — la fiche d’un compte porte le périmètre, comme la liste', () => {
  it('la clause de périmètre arrive jusqu’à la requête de la FICHE, et elle NOMME les BU portées', async () => {
    const { service, query } = buildAccountsService([{ id: 'a-1' }])

    await service.findOneForWorkspace('a-1', 'w-1', SCOPE_LYON)

    const [sql, params] = lastCall(query)
    expect(sql).toContain('business_unit_id')
    expect(params).toContain('a-1')
    expect(params).toContain('w-1')
    expect(params).toContainEqual(['bu-lyon'])
    expect(JSON.stringify(params)).not.toContain('bu-nantes')
  })

  it('la borne d’ESPACE survit à l’arrivée du filtre de périmètre', async () => {
    // Le risque n°1 du lot, écrit noir sur blanc au brief : une clause qui
    // REMPLACE `workspace_id = $2` au lieu de s'y AJOUTER ferait tomber le
    // cloisonnement entre ESN concurrentes — et l'écran aurait l'air juste.
    const { service, query } = buildAccountsService([{ id: 'a-1' }])

    await service.findOneForWorkspace('a-1', 'w-1', SCOPE_LYON)

    const [sql, params] = lastCall(query)
    expect(sql).toMatch(/a\.workspace_id = \$2/)
    expect(sql.match(/workspace_id/g) ?? []).toHaveLength(1)
    expect(params[1]).toBe('w-1')
    // Aucune clause de périmètre introduite par un `WHERE` supplémentaire.
    expect(sql.match(/\bWHERE\b/g) ?? []).toHaveLength(1)
  })

  it('la clause garde sa seconde moitié : « OU rattaché à aucun périmètre »', async () => {
    // Sans elle, tout le portefeuille historique — qui n'a aucune BU —
    // disparaîtrait pour chaque membre cloisonné le jour du déploiement.
    const { service, query } = buildAccountsService([{ id: 'a-1' }])

    await service.findOneForWorkspace('a-1', 'w-1', SCOPE_LYON)

    expect(lastCall(query)[0]).toMatch(/business_unit_id IS NULL/)
  })

  it('un membre cloisonné SANS aucun périmètre n’ouvre que ce que personne ne porte', async () => {
    // « Il ne porte rien » n'est pas « il voit tout » : la clause doit rester,
    // réduite à sa seconde moitié.
    const { service, query } = buildAccountsService([])

    await service.findOneForWorkspace('a-1', 'w-1', { businessUnitIds: [], includeUnassigned: true })

    const [sql, params] = lastCall(query)
    expect(sql).toMatch(/business_unit_id IS NULL/)
    expect(sql).not.toMatch(/\$3/)
    expect(params).toHaveLength(2)
  })

  it('hors périmètre, la réponse est « introuvable » — jamais « interdit »', async () => {
    // On SUIT la convention existante de `findOneForWorkspace` hors espace :
    // « ce compte existe mais tu n'y as pas droit » est déjà une fuite
    // d'information. Le dépôt rend `not_found`, et c'est volontaire.
    const { service } = buildAccountsService([])

    const result = await service.findOneForWorkspace('a-1', 'w-1', SCOPE_LYON)

    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.code).toBe('not_found')
  })
})

describe('GA-334 — TÉMOINS : le niveau qui voit tout l’espace ne change pas d’un octet', () => {
  it('sans périmètre, la requête de la fiche est byte-identique à celle d’avant', async () => {
    // `'workspace'` est le niveau de TOUT LE MONDE à cette heure : ce test est
    // la preuve que ce lot ne retire rien à personne.
    const sansParametre = buildAccountsService([{ id: 'a-1' }])
    await sansParametre.service.findOneForWorkspace('a-1', 'w-1')

    const avecNull = buildAccountsService([{ id: 'a-1' }])
    await avecNull.service.findOneForWorkspace('a-1', 'w-1', null)

    const [sqlSans, paramsSans] = lastCall(sansParametre.query)
    const [sqlNull, paramsNull] = lastCall(avecNull.query)
    expect(sqlSans).toBe(sqlNull)
    expect(paramsSans).toEqual(paramsNull)
    expect(sqlSans).not.toContain('business_unit')
    expect(paramsSans).toEqual(['a-1', 'w-1'])
  })

  it('sans périmètre, la fiche rend toujours le compte', async () => {
    const account = { id: 'a-1', company_name: 'SNCF' }
    const { service } = buildAccountsService([account])

    const result = await service.findOneForWorkspace('a-1', 'w-1', null)

    expect(isSuccess(result)).toBe(true)
    if (isSuccess(result)) expect(result.output).toEqual(account)
  })

  it('TÉMOIN — la lecture par UTILISATEUR (`findOne`) n’est pas touchée par ce lot', async () => {
    // Cas légitime voisin : `findOne(id, userId)` est l'ancien chemin mono-user.
    // Il ne porte pas de périmètre et ne doit pas en porter — la garde ne doit
    // pas déborder dessus.
    const { service, query } = buildAccountsService([{ id: 'a-1' }])

    await service.findOne('a-1', 'u-1')

    const [sql, params] = lastCall(query)
    expect(sql).toMatch(/a\.user_id = \$2/)
    expect(sql).not.toContain('business_unit')
    expect(params).toEqual(['a-1', 'u-1'])
  })
})

describe('GA-334 — la garde LIT du code réel : le corpus n’est pas vide', () => {
  it('le service des comptes expose bien la lecture de fiche qu’on garde', () => {
    const { service } = buildAccountsService()
    expect(typeof service.findOneForWorkspace).toBe('function')
    expect(service.findOneForWorkspace.length).toBeGreaterThanOrEqual(2)
  })
})

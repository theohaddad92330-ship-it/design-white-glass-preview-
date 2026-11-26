import { HttpException } from '@nestjs/common'
import { contactListQuerySchema } from '@bellum/contracts'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { ContactFailure, ContactsService } from './contacts.service'
import { ContactsController, throwContactFailure } from './contacts.controller'

/** Capture l'exception plutôt que de la laisser remonter : c'est le CORPS de la
 *  réponse qu'on vérifie, pas le fait qu'elle soit levée. */
function catchFailure(failure: ContactFailure): HttpException {
  try {
    throwContactFailure(failure)
  } catch (error) {
    if (error instanceof HttpException) return error
    throw error
  }
  throw new Error('throwContactFailure n’a rien levé')
}

describe('un refus d’enrichissement répond aux deux questions de l’utilisateur (§39/§46)', () => {
  it('le 409 porte le sort du crédit et la date de reprise', () => {
    // Le rapport montre ce 409 affiché nu : « le serveur a échoué sans indiquer
    // de raison ». Les deux questions posées à ce moment-là ne sont pas
    // techniques — « est-ce que ça m'a coûté un crédit ? » et « quand puis-je
    // réessayer ? ». Les déduire côté client obligerait à recopier une règle de
    // facturation dans l'interface.
    const thrown = catchFailure({
      code: 'enrichment_unchanged',
      message: 'Déjà enrichi le 2026-07-05',
      credit: 'not_debited',
      retryAt: '2026-08-04T00:00:00.000Z',
    })

    expect(thrown.getStatus()).toBe(409)
    expect(thrown.getResponse()).toMatchObject({
      code: 'enrichment_unchanged',
      credit: 'not_debited',
      retryAt: '2026-08-04T00:00:00.000Z',
    })
  })

  it('une panne fournisseur dit qu’elle n’a rien coûté', () => {
    // Sans cette mention, l'utilisateur compte un crédit perdu à chaque
    // incident amont — et le support doit le rassurer un par un.
    const thrown = catchFailure({
      code: 'enrichment_unavailable',
      message: 'Le fournisseur n’a pas répondu',
      reason: 'network_error',
    })

    expect(thrown.getStatus()).toBe(502)
    expect(thrown.getResponse()).toMatchObject({ credit: 'not_debited' })
  })

  it('même sans champ explicite, le défaut est « rien débité » — jamais l’inverse', () => {
    // Le défaut optimiste serait de dire « débité » par prudence comptable ;
    // ce serait accuser le produit à tort à chaque refus, et pousser des
    // demandes de remboursement pour des crédits jamais pris.
    const thrown = catchFailure({ code: 'enrichment_unchanged', message: 'x' })
    expect(thrown.getResponse()).toMatchObject({ credit: 'not_debited', retryAt: null })
  })
})

describe('GET /contacts/account/:accountId — LOT 4 (perf)', () => {
  it('délègue à findByAccountForHttp (la version PROJETÉE), jamais à findByAccount directement', async () => {
    const findByAccountForHttp = jest.fn().mockResolvedValue([])
    const findByAccount = jest.fn().mockResolvedValue([])
    const service = { findByAccountForHttp, findByAccount } as unknown as ContactsService
    const controller = new ContactsController(
      service,
      {} as never,
      // Le périmètre (BU) se résout au bord : l'espace de l'appelant, puis son
      // niveau d'accès. `null` = tout l'espace, le défaut historique.
      { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) } as never,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    )

    const result = await controller.findByAccount('acc-1', { userId: 'user-1' } as CurrentUserPayload)

    // ⚠️ Le TROISIÈME argument est le PÉRIMÈTRE : l'assertion le nomme, sinon
    // un correctif qui cesserait de le passer resterait vert.
    expect(findByAccountForHttp).toHaveBeenCalledWith('acc-1', 'user-1', null)
    expect(findByAccount).not.toHaveBeenCalled()
    return result
  })
})

describe('GET /contacts/account/:accountId?perimeter= — #4996 L4', () => {
  const build = () => {
    const findByAccountInPerimeter = jest.fn().mockResolvedValue({ contacts: [], outside_perimeter_count: 2 })
    const findByAccountForHttp = jest.fn().mockResolvedValue([])
    const controller = new ContactsController(
      { findByAccountInPerimeter, findByAccountForHttp } as unknown as ContactsService,
      {} as never,
      { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) } as never,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    )
    return { controller, findByAccountInPerimeter, findByAccountForHttp }
  }
  const user = { userId: 'user-1' } as CurrentUserPayload

  it('mine : délègue au périmètre avec le BU de l’appelant et rend le compteur', async () => {
    const { controller, findByAccountInPerimeter } = build()
    const out = await controller.findByAccount('acc-1', user, 'mine')
    expect(findByAccountInPerimeter).toHaveBeenCalledWith('acc-1', 'user-1', 'mine', null)
    expect(out).toEqual({ contacts: [], outside_perimeter_count: 2 })
  })

  it('sans paramètre : le tableau d’avant, le périmètre n’est pas lu', async () => {
    const { controller, findByAccountInPerimeter, findByAccountForHttp } = build()
    await controller.findByAccount('acc-1', user)
    expect(findByAccountForHttp).toHaveBeenCalled()
    expect(findByAccountInPerimeter).not.toHaveBeenCalled()
  })

  it('NON : une valeur inconnue est refusée en 400, rien n’est lu', async () => {
    const { controller, findByAccountInPerimeter } = build()
    await expect(controller.findByAccount('acc-1', user, 'zone')).rejects.toMatchObject({ status: 400 })
    expect(findByAccountInPerimeter).not.toHaveBeenCalled()
  })
})

describe('GET /contacts/search-by-name — #2727', () => {
  it('transmet userId + fullName/organizationName au service, sans les toucher', async () => {
    const searchPeopleByName = jest.fn().mockResolvedValue({ hits: [], status: 'ok' })
    const controller = new ContactsController({ searchPeopleByName } as unknown as ContactsService, {} as never)

    const result = await controller.searchByName({ userId: 'user-1' } as CurrentUserPayload, {
      fullName: 'Marion Sagnard',
      organizationName: 'Bedrock',
    })

    expect(searchPeopleByName).toHaveBeenCalledWith('user-1', 'Marion Sagnard', 'Bedrock')
    expect(result).toEqual({ hits: [], status: 'ok' })
  })
})

describe('GET /contacts/counts/ready-to-process — #2155.24/.25', () => {
  it('omet readyToProcess (jamais 0) quand la mesure échoue', async () => {
    const countReadyToProcess = jest.fn().mockResolvedValue(undefined)
    const controller = new ContactsController(
      { countReadyToProcess } as unknown as ContactsService,
      {} as never,
      { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) } as never,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    )

    const result = await controller.getBadgeCounters({ userId: 'user-1' } as CurrentUserPayload)

    expect(result).toEqual({})
  })

  it('rend le compteur quand la mesure réussit', async () => {
    const countReadyToProcess = jest.fn().mockResolvedValue(3)
    const controller = new ContactsController(
      { countReadyToProcess } as unknown as ContactsService,
      {} as never,
      { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) } as never,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    )

    const result = await controller.getBadgeCounters({ userId: 'user-1' } as CurrentUserPayload)

    expect(result).toEqual({ readyToProcess: 3 })
    expect(countReadyToProcess).toHaveBeenCalledWith('user-1', null)
  })
})

describe('GET /contacts/enrichment-duration-estimate — #2120.57 / #2297.23', () => {
  it('rend la médiane et le nombre d’échantillons servis par le service', async () => {
    const estimate = jest.fn().mockResolvedValue({ medianMs: 32_000, sampleSize: 12 })
    const controller = new ContactsController({} as unknown as ContactsService, {} as never, undefined, undefined, {
      estimate,
    } as never)

    const result = await controller.getEnrichmentDurationEstimate()

    expect(result).toEqual({ estimate: { medianMs: 32_000, sampleSize: 12 } })
  })

  it('rend null — jamais une 500 — quand le service n’est pas câblé', async () => {
    const controller = new ContactsController(
      {} as unknown as ContactsService,
      {} as never,
      undefined,
      undefined,
      undefined,
    )

    const result = await controller.getEnrichmentDurationEstimate()

    expect(result).toEqual({ estimate: null })
  })

  it('rend null quand le service répond null (moins de 5 mesures)', async () => {
    const estimate = jest.fn().mockResolvedValue(null)
    const controller = new ContactsController({} as unknown as ContactsService, {} as never, undefined, undefined, {
      estimate,
    } as never)

    const result = await controller.getEnrichmentDurationEstimate()

    expect(result).toEqual({ estimate: null })
  })
})

describe('GET /contacts/account/:accountId/ranking — #2120.30-38', () => {
  it('transmet les trois choix du commercial au classement, sans en avaler un', async () => {
    const rankForAccount = jest.fn().mockResolvedValue({ ranked: [] })
    const controller = new ContactsController(
      { rankForAccount } as unknown as ContactsService,
      {} as never,
      // Le périmètre (BU) se résout au bord : l'espace de l'appelant, puis son
      // niveau d'accès. `null` = tout l'espace, le défaut historique.
      { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) } as never,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    )
    const query = { perimeter: 'Filiale Retail', subject: 'Data', offer: 'Migration Cloud' }

    const result = await controller.rankByAccount('acc-1', { userId: 'user-1' } as CurrentUserPayload, query)

    // ⚠️ Le QUATRIÈME argument est le PÉRIMÈTRE : `null` = tout l'espace.
    expect(rankForAccount).toHaveBeenCalledWith('acc-1', 'user-1', query, null)
    return result
  })
})

describe('POST/DELETE /contacts/:id/recommendation-authorization — #2160.60', () => {
  it('POST délègue à authorizeRecommendation avec la raison levée', async () => {
    const authorizeRecommendation = jest.fn().mockResolvedValue({ type: 'success', output: { id: 'c1' } })
    const controller = new ContactsController({ authorizeRecommendation } as unknown as ContactsService, {} as never)

    await controller.authorizeRecommendation(
      'c1',
      { userId: 'user-1' } as CurrentUserPayload,
      { reason: 'homonym_conflict' } as never,
    )

    expect(authorizeRecommendation).toHaveBeenCalledWith('c1', 'user-1', 'homonym_conflict')
  })

  it('DELETE délègue à revokeRecommendationAuthorization — le geste réversible', async () => {
    const revokeRecommendationAuthorization = jest.fn().mockResolvedValue({ type: 'success', output: { id: 'c1' } })
    const controller = new ContactsController(
      { revokeRecommendationAuthorization } as unknown as ContactsService,
      {} as never,
    )

    await controller.revokeRecommendationAuthorization('c1', { userId: 'user-1' } as CurrentUserPayload)

    expect(revokeRecommendationAuthorization).toHaveBeenCalledWith('c1', 'user-1')
  })
})

describe('POST /contacts/:id/erasure — #2297 effacer une personne (RGPD art. 17)', () => {
  it('résout l’espace ACTIF, le rôle et les accords en propre au bord, puis délègue', async () => {
    const erase = jest.fn().mockResolvedValue({ erased: true, erased_at: '2026-09-19T10:00:00.000Z' })
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' }),
      extraPermissionsOf: jest.fn().mockResolvedValue(['crm:read']),
    }
    const controller = new ContactsController(
      {} as never,
      {} as never,
      workspaceContext as never,
      undefined,
      undefined,
      { erase } as never,
    )

    const result = await controller.erasePerson('c-1', { userId: 'user-1' } as CurrentUserPayload, { confirm: true })

    expect(workspaceContext.extraPermissionsOf).toHaveBeenCalledWith('ws-1', 'user-1')
    expect(erase).toHaveBeenCalledWith({
      contactId: 'c-1',
      userId: 'user-1',
      workspaceId: 'ws-1',
      role: 'sales',
      extraPermissions: ['crm:read'],
    })
    expect(result).toEqual({ erased: true, erased_at: '2026-09-19T10:00:00.000Z' })
  })

  it('sait dire NON : sans le service d’effacement câblé, la route LÈVE — elle ne répond pas « effacé »', async () => {
    const controller = new ContactsController(
      {} as never,
      {} as never,
      {
        resolveActiveWorkspace: jest.fn(),
        extraPermissionsOf: jest.fn(),
      } as never,
    )
    await expect(
      controller.erasePerson('c-1', { userId: 'user-1' } as CurrentUserPayload, { confirm: true }),
    ).rejects.toThrow('person_erasure_unavailable')
  })
})

describe('#3400 — le 402 ne dit « épuisés » que si le solde l’est', () => {
  it('une fin d’essai porte son code machine, un solde vide reste un message nu', () => {
    const trial = catchFailure({ code: 'insufficient_credits', message: 'Essai terminé.', refusal: 'trial_ended' })
    expect(trial.getStatus()).toBe(402)
    expect(trial.getResponse()).toEqual({ message: 'Essai terminé.', code: 'trial_ended' })
    const empty = catchFailure({ code: 'insufficient_credits', message: 'Épuisés.' })
    expect(empty.getResponse()).toBe('Épuisés.')
  })
})

describe('GET /contacts/:id/preflight — #3219 (#190.2 côté contact)', () => {
  const user = { userId: 'user-1' } as CurrentUserPayload
  type ReadConflicts = (workspaceId: string, contactId: string) => Promise<unknown>
  const scopeDeps = () =>
    [
      { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) } as never,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    ] as const

  it('lit les contradictions du contact avec le MÊME détecteur que la fiche compte (tranchées comprises)', async () => {
    const preflight = jest.fn(async (_id: string, _userId: string, options: { readConflicts: ReadConflicts }) => {
      await options.readConflicts('ws-1', 'c-1')
      return { type: 'success', output: { status: 'no_difference' } }
    })
    const openConflicts = jest.fn().mockResolvedValue([])
    const controller = new ContactsController(
      { preflight } as unknown as ContactsService,
      {} as never,
      ...scopeDeps(),
      undefined,
      undefined,
      { openConflicts } as never,
    )

    await controller.getPreflight('c-1', user, 'export_crm')

    expect(preflight).toHaveBeenCalledWith(
      'c-1',
      'user-1',
      expect.objectContaining({ action: 'export_crm', businessUnitScope: null }),
    )
    expect(openConflicts).toHaveBeenCalledWith('ws-1', 'contact', 'c-1', { includeSettled: true })
  })

  it('sans action : `null`, jamais une action devinée', async () => {
    const preflight = jest.fn().mockResolvedValue({ type: 'success', output: {} })
    const controller = new ContactsController({ preflight } as unknown as ContactsService, {} as never, ...scopeDeps())
    await controller.getPreflight('c-1', user, undefined)
    expect(preflight).toHaveBeenCalledWith('c-1', 'user-1', expect.objectContaining({ action: null }))
  })

  it('sait dire NON : une action hors vocabulaire est refusée (400), pas ignorée', async () => {
    const preflight = jest.fn()
    const controller = new ContactsController({ preflight } as unknown as ContactsService, {} as never, ...scopeDeps())
    await expect(controller.getPreflight('c-1', user, 'send_now')).rejects.toBeInstanceOf(HttpException)
    expect(preflight).not.toHaveBeenCalled()
  })

  it('sans le détecteur câblé, le journal est dit ILLISIBLE (la lecture rejette), jamais « vide »', async () => {
    let read: Promise<unknown> | undefined
    const preflight = jest.fn(async (_id: string, _userId: string, options: { readConflicts: ReadConflicts }) => {
      read = options.readConflicts('ws-1', 'c-1')
      read.catch(() => undefined)
      return { type: 'success', output: {} }
    })
    const controller = new ContactsController({ preflight } as unknown as ContactsService, {} as never, ...scopeDeps())
    await controller.getPreflight('c-1', user, undefined)
    await expect(read).rejects.toThrow()
  })
})

describe('GET /contacts?account_id=…&limit=25 — #4475 (BLM-C1820F80)', () => {
  const ACCOUNT = '3f6c1a52-8d4e-4b7a-9c21-5e0a1d7b9f10'
  const makeController = (findAllForUser: jest.Mock) =>
    new ContactsController(
      { findAllForUser } as unknown as ContactsService,
      {} as never,
      { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) } as never,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    )

  it('la clé snake_case est reconnue par le contrat, pas retirée en silence', () => {
    const parsed = contactListQuerySchema.parse({ account_id: ACCOUNT, limit: '25' })
    expect(parsed.account_id).toBe(ACCOUNT)
    expect(parsed.limit).toBe(25)
  })

  it('le service reçoit le compte (accountId) : la liste est celle du compte, jamais tout l’espace', async () => {
    const findAllForUser = jest.fn().mockResolvedValue({ items: [] })
    const query = contactListQuerySchema.parse({ account_id: ACCOUNT, limit: '25' })

    await makeController(findAllForUser).findAll({ userId: 'user-1' } as CurrentUserPayload, query as never)

    const filters = findAllForUser.mock.calls[0][1]
    expect(filters.accountId).toBe(ACCOUNT)
    expect(filters.limit).toBe(25)
    expect(filters).not.toHaveProperty('account_id')
  })

  it('une valeur qui n’est pas un identifiant est refusée par le contrat (400), jamais ignorée', () => {
    expect(contactListQuerySchema.safeParse({ account_id: 'pas-un-uuid' }).success).toBe(false)
  })
})

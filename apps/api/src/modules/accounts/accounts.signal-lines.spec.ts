import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { accountSignalLinesSchema } from '@bellum/contracts'
import { AccountsController } from './accounts.controller'
import type { AccountSignalLinesService } from './account-signal-lines.service'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'

/**
 * #4755 / #4756 (lot 761) — `GET /accounts/:id/signal-lines` : la porte d'appartenance AVANT toute lecture.
 * Un compte hors de l'espace (ou de la business unit du lecteur) rend 404 et le service n'est JAMAIS appelé.
 */

const USER: CurrentUserPayload = { userId: 'user-1', email: 'user@esn.fr' }
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'

function build(found: boolean, service: Partial<AccountSignalLinesService> | undefined) {
  const findOneForWorkspace = jest
    .fn()
    .mockResolvedValue(
      found
        ? { type: 'success', output: { id: ACCOUNT_ID } }
        : { type: 'failure', problem: { code: 'not_found', message: 'Compte introuvable' } },
    )
  const params: unknown[] = new Array(25).fill({})
  params[0] = { findOneForWorkspace } // accountsService
  params[6] = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' }) }
  params[15] = { scopeFor: jest.fn().mockResolvedValue(null) } // businessUnits
  params[24] = service // signalLines (dernier paramètre)
  const controller = new AccountsController(...(params as ConstructorParameters<typeof AccountsController>))
  return { controller, findOneForWorkspace }
}

describe('GET /accounts/:id/signal-lines', () => {
  it('REFUS : un compte d’un autre espace rend 404 et le service n’est pas lu', async () => {
    const forAccount = jest.fn()
    const { controller, findOneForWorkspace } = build(false, { forAccount })
    await expect(controller.signalLinesOf(ACCOUNT_ID, USER)).rejects.toBeInstanceOf(NotFoundException)
    expect(findOneForWorkspace).toHaveBeenCalledWith(ACCOUNT_ID, 'ws-1', null)
    expect(forAccount).not.toHaveBeenCalled()
  })

  it('un compte de l’espace rend ses lignes, lues dans CET espace', async () => {
    const payload = { lines: [], verified_at: null, open_deals: 0 }
    const forAccount = jest.fn().mockResolvedValue(payload)
    const { controller } = build(true, { forAccount })
    const result = await controller.signalLinesOf(ACCOUNT_ID, USER)
    expect(accountSignalLinesSchema.parse(result)).toEqual(payload)
    expect(forAccount).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      accountId: ACCOUNT_ID,
      marketPaths: expect.any(Function),
    })
  })

  it('le service rend null (compte supprimé entre-temps) : 404, jamais un tableau vide', async () => {
    const { controller } = build(true, { forAccount: jest.fn().mockResolvedValue(null) })
    await expect(controller.signalLinesOf(ACCOUNT_ID, USER)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('service absent : 503 NOMMÉ, jamais « aucun signal »', async () => {
    const { controller } = build(true, undefined)
    await expect(controller.signalLinesOf(ACCOUNT_ID, USER)).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
})

/** Lot 764 — `GET /accounts/signal-history` : le PÉRIMÈTRE du lecteur part avec la lecture de l'espace. */
describe('GET /accounts/signal-history', () => {
  it('le périmètre de business unit résolu pour le lecteur est transmis tel quel, dans CET espace', async () => {
    const scope = { businessUnitIds: ['bu-1'], includeUnassigned: true as const }
    const forWorkspace = jest.fn().mockResolvedValue({ accounts: [] })
    const { controller } = build(true, { forWorkspace })
    const businessUnits = (controller as unknown as { businessUnits: { scopeFor: jest.Mock } }).businessUnits
    businessUnits.scopeFor.mockResolvedValue(scope)
    await expect(controller.signalHistory(USER, {})).resolves.toEqual({ accounts: [] })
    expect(forWorkspace).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      businessUnitScope: scope,
      marketPaths: expect.any(Function),
      limit: 50,
      offset: 0,
      search: undefined,
    })
  })

  it('lot 785 — limit / offset / q de la query-string partent au service (page de 50 par défaut)', async () => {
    const forWorkspace = jest.fn().mockResolvedValue({ accounts: [] })
    const { controller } = build(true, { forWorkspace })
    await controller.signalHistory(USER, { limit: '20', offset: '40', q: ' power bi ' })
    expect(forWorkspace).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, offset: 40, search: 'power bi' }))
  })

  it('lot 785 — REFUS : un paramètre inconnu ou hors borne rend 400 et rien n’est lu', async () => {
    const forWorkspace = jest.fn()
    const { controller } = build(true, { forWorkspace })
    await expect(controller.signalHistory(USER, { search: 'java' })).rejects.toBeInstanceOf(BadRequestException)
    await expect(controller.signalHistory(USER, { limit: '9999' })).rejects.toBeInstanceOf(BadRequestException)
    expect(forWorkspace).not.toHaveBeenCalled()
  })

  it('service absent : 503 NOMMÉ, jamais un historique vide', async () => {
    const { controller } = build(true, undefined)
    await expect(controller.signalHistory(USER, {})).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
})

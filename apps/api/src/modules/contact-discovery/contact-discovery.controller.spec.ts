/**
 * #2809 — L'APPELANT de la découverte fraîche de contacts : résout la
 * sélection dans le périmètre de l'appelant (espace + unité), jamais un
 * identifiant hors périmètre — même discipline que `AnalysisController.
 * deepenQuote` (`analysis.controller.deepen.spec.ts`).
 */
import { NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { failure, success } from '@bellum/utils'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { AccountsService } from '../accounts/accounts.service'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { CreditsService } from '../credits/credits.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ContactDiscoveryController } from './contact-discovery.controller'
import { ContactDiscoveryService } from './contact-discovery.service'

const USER = { userId: 'u-1' } as CurrentUserPayload
const MINE = '11111111-1111-4111-8111-111111111111'
const FOREIGN = '99999999-9999-4999-8999-999999999999'

async function buildController() {
  const accountsService = {
    findOneForWorkspace: jest.fn(async (id: string) =>
      id === MINE ? success({ id: MINE, company_name: 'Acme' }) : failure({ code: 'not_found' as const, message: 'x' }),
    ),
  }
  const discovery = {
    quote: jest.fn(() => ({ lines: [], delta: 0, remaining: 7, sufficient: true })),
    run: jest.fn(async () => ({ accountId: MINE, status: 'ok', found: 1, created: 1, cost: 1 })),
  }
  const credits = { getCredits: jest.fn(async () => ({ credits_remaining: 7 })) }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws-1' })),
    isDemoWorkspace: jest.fn(async () => false),
  }
  const providers = [
    { provide: ContactDiscoveryService, useValue: discovery },
    { provide: AccountsService, useValue: accountsService },
    { provide: WorkspaceContextService, useValue: workspaceContext },
    { provide: BusinessUnitService, useValue: { scopeFor: jest.fn(async () => null) } },
    { provide: CreditsService, useValue: credits },
  ]
  const moduleRef = await Test.createTestingModule({ controllers: [ContactDiscoveryController], providers }).compile()
  return { controller: moduleRef.get(ContactDiscoveryController), discovery, accountsService, workspaceContext }
}

describe('POST /contacts/discover/quote', () => {
  it("ne passe au devis QUE les comptes visibles de l'appelant, avec son solde", async () => {
    const { controller, discovery } = await buildController()

    await controller.quote({ accountIds: [MINE, FOREIGN] }, USER)

    expect(discovery.quote).toHaveBeenCalledWith([expect.objectContaining({ id: MINE })], 7)
  })
})

describe('POST /contacts/discover/:accountId', () => {
  it('lance la découverte sur un compte visible', async () => {
    const { controller, discovery } = await buildController()

    const outcome = await controller.run(MINE, { titles: ['RSSI'] }, USER)

    expect(discovery.run).toHaveBeenCalledWith(expect.objectContaining({ id: MINE }), 'u-1', ['RSSI'], false)
    expect(outcome).toEqual({ accountId: MINE, status: 'ok', found: 1, created: 1, cost: 1 })
  })

  it('#4058 — l’expertise dérive les intitulés, le secteur ne pèse sur aucun (#4057 : rien d’autre n’est requis)', async () => {
    const { controller, discovery } = await buildController()

    await controller.run(MINE, { expertise: 'cyber GRC', sector: 'énergie' }, USER)

    const titles = (discovery.run.mock.calls.at(-1) as unknown as [unknown, string, string[]])[2]
    expect(titles).toEqual(expect.arrayContaining(['RSSI', 'Responsable GRC']))
    expect(titles.join(' ').toLowerCase()).not.toContain('énergie')
  })

  it('en espace de démonstration, le service le sait — aucun appel réseau ne lui échappe', async () => {
    const { controller, discovery, workspaceContext } = await buildController()
    workspaceContext.isDemoWorkspace.mockResolvedValueOnce(true)

    await controller.run(MINE, {}, USER)

    expect(discovery.run).toHaveBeenCalledWith(expect.objectContaining({ id: MINE }), 'u-1', undefined, true)
  })

  it('un compte hors périmètre rend 404, jamais atteint par la découverte', async () => {
    const { controller, discovery } = await buildController()

    await expect(controller.run(FOREIGN, {}, USER)).rejects.toBeInstanceOf(NotFoundException)
    expect(discovery.run).not.toHaveBeenCalled()
  })
})

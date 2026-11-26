import { ServiceUnavailableException } from '@nestjs/common'
import type { BaseReaderResult } from '@bellum/contracts'
import { BaseReaderController } from './base-reader.controller'
import type { BaseReaderSearchDto } from './dto/base-reader-search.dto'
import type { BaseReaderScope, BaseReaderService } from './base-reader.service'

/**
 * #4792 — la porte interne : ce qu'elle RÉSOUT avant de lire, et ce qu'elle REFUSE.
 *
 * Le périmètre (espace actif + Business Unit) se résout AU BORD et descend entier. Sans service de
 * périmètre, la porte LÈVE : le repli « pas de service, donc pas de filtre » ouvrirait l'espace
 * entier sans qu'aucun écran ne change d'apparence.
 */

const USER = '44444444-4444-4444-8444-444444444444'
const WS = 'ws-1'
const BU = '33333333-3333-4333-8333-333333333333'

const dto = (over: Record<string, unknown> = {}): BaseReaderSearchDto =>
  ({ userId: USER, ...over }) as unknown as BaseReaderSearchDto

const EMPTY: BaseReaderResult = { readAt: '2026-10-29T10:00:00.000Z' }

function controllerOf(options: { businessUnits?: false; scope?: BaseReaderScope['businessUnitScope'] } = {}) {
  const read = jest.fn<Promise<BaseReaderResult>, [BaseReaderScope, Record<string, unknown>]>(async () => EMPTY)
  const reader = { read } as unknown as BaseReaderService
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WS, role: 'owner' })),
  } as never
  const scope =
    'scope' in options ? (options.scope ?? null) : ({ businessUnitIds: [BU], includeUnassigned: true } as const)
  const businessUnits =
    options.businessUnits === false ? undefined : ({ scopeFor: jest.fn(async () => scope) } as never)
  return { controller: new BaseReaderController(reader, workspaceContext, businessUnits), read }
}

describe('#4792 — la porte interne du lecteur commun', () => {
  it('résout l’espace ACTIF du demandeur et le passe entier au lecteur', async () => {
    const { controller, read } = controllerOf()
    await controller.search(dto({ terms: ['Java'], city: 'Lille' }))
    expect(read).toHaveBeenCalledTimes(1)
    const [passedScope, passedCriteria] = read.mock.calls[0] ?? []
    expect(passedScope).toEqual({
      workspaceId: WS,
      businessUnitScope: { businessUnitIds: [BU], includeUnassigned: true },
    })
    expect(passedCriteria).toMatchObject({ terms: ['Java'], city: 'Lille' })
  })

  it('sans service de périmètre, elle LÈVE — jamais une lecture sans cloisonnement de BU', async () => {
    const { controller, read } = controllerOf({ businessUnits: false })
    await expect(controller.search(dto())).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(read).not.toHaveBeenCalled()
  })

  it('un membre en accès « espace entier » passe `null` — le défaut historique, pas un filtre vide', async () => {
    const { controller, read } = controllerOf({ scope: null })
    await controller.search(dto())
    expect(read.mock.calls[0]?.[0]).toMatchObject({ businessUnitScope: null })
  })
})

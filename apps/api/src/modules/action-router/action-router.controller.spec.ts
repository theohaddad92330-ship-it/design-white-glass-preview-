/**
 * ActionRouterController — thin JWT surface over ActionRouterService. Confirms
 * both routes forward the principal (userId/email from the token, never the body)
 * and that the JWT guard is wired.
 */
import type { ActionIntent } from '@bellum/contracts'
import { JwtGuard } from '../auth/jwt.guard'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { ActionRouterController } from './action-router.controller'
import type { MemoryService } from '../memory/memory.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ActionRouterService } from './action-router.service'
import type { DispatchBulkDto } from './dto/dispatch-bulk.dto'

const user = { userId: 'user-1', email: 'rep@esn.fr' } as CurrentUserPayload

function build() {
  const service = { dispatch: jest.fn(), dispatchBulk: jest.fn(), simulateBulk: jest.fn() }
  const memory = { getPreferences: jest.fn(), patchPreferences: jest.fn(), forgetLedgerEntry: jest.fn() }
  const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws-1', role: 'member' })) }
  const controller = new ActionRouterController(
    service as unknown as ActionRouterService,
    memory as unknown as MemoryService,
    workspaceContext as unknown as WorkspaceContextService,
  )
  return { controller, service, memory }
}

describe('ActionRouterController', () => {
  it('POST /actions/dispatch forwards the intent + principal to the service', async () => {
    const { controller, service } = build()
    const intent = { type: 'enrich_contact', contactId: 'c1' } as unknown as ActionIntent
    service.dispatch.mockResolvedValueOnce({ type: 'enrich_contact', status: 'done' })

    const res = await controller.dispatch(intent, user)

    expect(service.dispatch).toHaveBeenCalledWith(intent, { userId: 'user-1', email: 'rep@esn.fr' })
    expect(res).toEqual({ type: 'enrich_contact', status: 'done' })
  })

  it('POST /actions/dispatch/bulk forwards the intents list + principal', async () => {
    const { controller, service } = build()
    const dto = { intents: [{ type: 'send_email', contactId: 'c1' }] } as unknown as DispatchBulkDto
    service.dispatchBulk.mockResolvedValueOnce({
      results: [],
      summary: { total: 0, done: 0, queued: 0, skipped: 0, failed: 0 },
    })

    await controller.dispatchBulk(dto, user)

    expect(service.dispatchBulk).toHaveBeenCalledWith(dto.intents, { userId: 'user-1', email: 'rep@esn.fr' })
  })

  it('#2400.5 — POST /actions/simulate transmet le NIVEAU demandé, jamais un défaut', async () => {
    const { controller, service } = build()
    const dto = {
      intents: [{ type: 'pin_memory_fact', fact: 'siège à Lyon' }],
      actionLevel: 'automate',
    } as unknown as Parameters<typeof controller.simulate>[0]
    service.simulateBulk.mockResolvedValueOnce({ level: 'automate', gestures: [], blocked: 0, validated: false })

    await controller.simulate(dto, user)

    expect(service.simulateBulk).toHaveBeenCalledWith(dto.intents, {
      userId: 'user-1',
      email: 'rep@esn.fr',
      actionLevel: 'automate',
      // ⚠️ Le clic de celui qui SIMULE ne vaut pas accord : on veut savoir ce
      // qui partirait tout seul. Simuler en `user` rendrait un rapport
      // toujours vert, donc inutile.
      origin: 'system',
    })
  })

  // #2896 / #2449.34 — le niveau d'action se LIT et se RÈGLE pour soi : l'identité
  // vient du jeton, jamais du corps.
  it('GET /actions/level lit le niveau réglé de l’appelant', async () => {
    const { controller, memory } = build()
    memory.getPreferences.mockResolvedValueOnce({ copilotActionLevel: 'prepare' })

    await expect(controller.level(user)).resolves.toEqual({ level: 'prepare' })
    expect(memory.getPreferences).toHaveBeenCalledWith('user-1')
  })

  it('PUT /actions/level écrit pour l’appelant seulement', async () => {
    const { controller, memory } = build()

    await expect(controller.setLevel({ level: 'respond_only' }, user)).resolves.toEqual({ level: 'respond_only' })
    expect(memory.patchPreferences).toHaveBeenCalledWith('user-1', { copilotActionLevel: 'respond_only' })

    await expect(controller.setLevel({ level: null }, user)).resolves.toEqual({ level: null })
    expect(memory.forgetLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        workspaceId: 'ws-1',
        layer: 'preferences',
        id: 'copilotActionLevel',
      }),
    )
  })

  it('is guarded by the JWT guard', () => {
    const guards = Reflect.getMetadata('__guards__', ActionRouterController) as unknown[]
    expect(guards).toContain(JwtGuard)
  })
})

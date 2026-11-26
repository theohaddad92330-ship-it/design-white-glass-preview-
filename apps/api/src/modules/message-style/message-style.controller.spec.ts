/**
 * #2369.9/.10/.13/.7/.8 — la surface HTTP : gardée, espace et rôle résolus
 * depuis le TOKEN (jamais le body), permission déclarée sur chaque écriture.
 */
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { MessageStyleController } from './message-style.controller'
import type { MessageStyleService } from './message-style.service'

const user = { userId: 'user-1', email: 'rep@esn.fr' } as CurrentUserPayload

function build() {
  const service = {
    createTemplate: jest.fn(),
    listTemplates: jest.fn().mockResolvedValue([]),
    getTemplate: jest.fn(),
    transitionTemplate: jest.fn(),
    proposeRule: jest.fn(),
    listRuleProposals: jest.fn().mockResolvedValue([]),
    decideRuleProposal: jest.fn(),
    importAndAnalyze: jest.fn(),
    previewCompare: jest.fn(),
    getUsageByStyle: jest.fn().mockResolvedValue([]),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' }),
  }
  const controller = new MessageStyleController(service as unknown as MessageStyleService, workspaceContext as never)
  return { controller, service }
}

describe('MessageStyleController', () => {
  it('est gardé par JwtGuard + WorkspacePermissionGuard', () => {
    const guards = Reflect.getMetadata('__guards__', MessageStyleController) as unknown[]
    expect(guards).toContain(JwtGuard)
    expect(guards).toContain(WorkspacePermissionGuard)
  })

  it('créer et transiter un template, proposer une règle, importer un message, comparer un aperçu exigent records:write', () => {
    for (const method of [
      'createTemplate',
      'transitionTemplate',
      'proposeRule',
      'importMessage',
      'previewCompare',
    ] as const) {
      const handler = MessageStyleController.prototype[method]
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual(['records:write'])
    }
  })

  it('décider une proposition (#2369.8) exige team:manage — jamais records:write seul', () => {
    const handler = MessageStyleController.prototype.decideRuleProposal
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual(['team:manage'])
  })

  it('résout l’espace et le rôle depuis le TOKEN, jamais depuis le corps', async () => {
    const { controller, service } = build()
    await controller.listTemplates(user)
    const [ctx] = service.listTemplates.mock.calls[0] as [unknown]
    expect(ctx).toEqual({ userId: 'user-1', workspaceId: 'ws-1', role: 'sales' })
  })

  it('créer un template passe le dto tel quel au service', async () => {
    const { controller, service } = build()
    const dto = { objective: 'Relancer', channel: 'email' as const, persona: 'DSI', forbidden: [] }
    await controller.createTemplate(dto, user)
    expect(service.createTemplate).toHaveBeenCalledWith({ userId: 'user-1', workspaceId: 'ws-1', role: 'sales' }, dto)
  })

  it('proposer une règle passe le dto tel quel au service', async () => {
    const { controller, service } = build()
    const dto = { signal: 'tone_preference' as const, observation: 'Plus direct' }
    await controller.proposeRule(dto, user)
    expect(service.proposeRule).toHaveBeenCalledWith({ userId: 'user-1', workspaceId: 'ws-1', role: 'sales' }, dto)
  })

  // #2369.2/.3/.4/.5 (LOT SOIR 26/09) — importer un message passe le dto tel quel au service.
  it('importer un message passe le dto tel quel au service', async () => {
    const { controller, service } = build()
    const dto = { importKind: 'email' as const, sourceType: 'sent_message' as const, rawText: 'Bonjour,' }
    await controller.importMessage(dto, user)
    expect(service.importAndAnalyze).toHaveBeenCalledWith({ userId: 'user-1', workspaceId: 'ws-1', role: 'sales' }, dto)
  })

  // #2369.11 (reste, épopée #2768) — comparer un aperçu passe le dto tel quel au service.
  it('comparer un aperçu passe le dto tel quel au service', async () => {
    const { controller, service } = build()
    const dto = { objective: 'Relancer', channel: 'email' as const, contactId: 'contact-1' }
    await controller.previewCompare(dto, user)
    expect(service.previewCompare).toHaveBeenCalledWith({ userId: 'user-1', workspaceId: 'ws-1', role: 'sales' }, dto)
  })

  // #2369.12 (reste, épopée #2768) — usage par style : une lecture d'espace, aucun paramètre.
  it('les taux d’usage se lisent en `WorkspaceRead`, pas `records:write`', () => {
    const handler = MessageStyleController.prototype.usageByStyle
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toBeUndefined()
  })

  it('les taux d’usage résolvent l’espace depuis le TOKEN', async () => {
    const { controller, service } = build()
    await controller.usageByStyle(user)
    expect(service.getUsageByStyle).toHaveBeenCalledWith({ userId: 'user-1', workspaceId: 'ws-1', role: 'sales' })
  })
})

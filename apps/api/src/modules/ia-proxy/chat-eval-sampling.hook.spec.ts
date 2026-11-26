import { IaProxyController } from './ia-proxy.controller'

/** #2899 — le point d'accroche : un tour de l'utilisateur est proposé à l'échantillonnage, une réponse de Laura jamais. */
function build(isDemo = false) {
  const chatMessages = {
    create: jest.fn().mockImplementation(async (args: { role: string; content: string }) => ({
      id: 'm-1',
      account_id: null,
      conversation_id: 'general',
      role: args.role,
      content: args.content,
      created_at: new Date('2026-10-12T09:00:00.000Z'),
    })),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    isDemoWorkspace: jest.fn().mockResolvedValue(isDemo),
  }
  const toolRegistry = { list: jest.fn().mockResolvedValue([]) }
  const controller = new IaProxyController(
    {} as never,
    chatMessages as never,
    workspaceContext as never,
    {} as never,
    {} as never,
    {} as never,
    { get: () => 0 } as never,
    toolRegistry as never,
    {} as never,
  )
  const evalSampling = { recordUserTurn: jest.fn().mockResolvedValue(true) }
  Object.assign(controller, { evalSampling })
  return { controller, evalSampling }
}

const USER = { userId: 'u-1' } as never
const dto = (over: Record<string, unknown>) => ({ role: 'user', content: 'prépare une relance', ...over }) as never

describe('#2899 — createChatMessage et l’échantillonnage', () => {
  it('un tour de l’utilisateur est proposé à l’échantillonnage, avec l’espace actif', async () => {
    const { controller, evalSampling } = build()
    await controller.createChatMessage(USER, dto({}))
    expect(evalSampling.recordUserTurn).toHaveBeenCalledWith('ws-1', 'prépare une relance')
  })

  it('une réponse de Laura n’est jamais échantillonnée', async () => {
    const { controller, evalSampling } = build()
    await controller.createChatMessage(USER, dto({ role: 'assistant' }))
    expect(evalSampling.recordUserTurn).not.toHaveBeenCalled()
  })

  it('une question à pièce jointe ou vocale n’est jamais échantillonnée', async () => {
    const { controller, evalSampling } = build()
    await controller.createChatMessage(USER, dto({ documentIds: ['d-1'] }))
    await controller.createChatMessage(USER, dto({ imageObjectIds: ['i-1'] }))
    await controller.createChatMessage(USER, dto({ voiceObjectId: 'v-1' }))
    expect(evalSampling.recordUserTurn).not.toHaveBeenCalled()
  })

  describe('#2958.98 — l’exception nommée (EVAL_MESSAGE_BODY_USER_ID)', () => {
    const LOUIS = '7c0e6a52-1b2d-4f3e-9a8b-0c1d2e3f4a5b'
    afterEach(() => {
      delete process.env['EVAL_MESSAGE_BODY_USER_ID']
    })

    it('l’utilisateur nommé, hors démo : le tour part avec l’exception', async () => {
      process.env['EVAL_MESSAGE_BODY_USER_ID'] = LOUIS
      const { controller, evalSampling } = build()
      await controller.createChatMessage({ userId: LOUIS } as never, dto({}))
      expect(evalSampling.recordUserTurn).toHaveBeenCalledWith('ws-1', 'prépare une relance', {
        allowMessageBody: true,
      })
    })

    it('sait dire NON — un autre utilisateur, ou la démo, n’a jamais l’exception', async () => {
      process.env['EVAL_MESSAGE_BODY_USER_ID'] = LOUIS
      const other = build()
      await other.controller.createChatMessage(USER, dto({}))
      expect(other.evalSampling.recordUserTurn).toHaveBeenCalledWith('ws-1', 'prépare une relance')

      const demo = build(true)
      await demo.controller.createChatMessage({ userId: LOUIS } as never, dto({}))
      expect(demo.evalSampling.recordUserTurn).toHaveBeenCalledWith('ws-1', 'prépare une relance')
    })
  })
})

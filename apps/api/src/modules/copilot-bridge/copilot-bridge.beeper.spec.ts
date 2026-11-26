import { CopilotBridgeController } from './copilot-bridge.controller'

/**
 * #4406.5 (c96) — Laura LIT une conversation Beeper de L'UTILISATEUR du tour pour préparer une
 * réponse. Deux lectures, jamais un envoi : le pont ne connaît pas `sendReply`.
 */
describe('CopilotBridgeController — Beeper (#4406.5)', () => {
  const beeper = {
    listConversations: jest.fn(async () => ({ state: 'connected', conversations: [] })),
    readOwnChat: jest.fn(async () => ({ state: 'connected', chatId: 'c1', messages: [] })),
    sendReply: jest.fn(),
  }
  const self = { beeper } as unknown as CopilotBridgeController
  const uid = '11111111-1111-4111-8111-111111111111'

  it('lit les conversations et UNE conversation de l’utilisateur du tour', async () => {
    await CopilotBridgeController.prototype.beeperConversations.call(self, { userId: uid })
    expect(beeper.listConversations).toHaveBeenCalledWith(uid)
    await CopilotBridgeController.prototype.beeperChat.call(self, { userId: uid, chatId: 'c1' })
    expect(beeper.readOwnChat).toHaveBeenCalledWith(uid, 'c1')
    expect(beeper.sendReply).not.toHaveBeenCalled()
  })

  it('sans module Beeper : l’état est NOMMÉ, jamais une liste vide', async () => {
    const none = {} as unknown as CopilotBridgeController
    expect(await CopilotBridgeController.prototype.beeperConversations.call(none, { userId: uid })).toEqual({
      state: 'disconnected',
    })
    expect(await CopilotBridgeController.prototype.beeperChat.call(none, { userId: uid, chatId: 'c1' })).toEqual({
      state: 'disconnected',
    })
  })
})

import { chatNotificationLink } from './chat-notification-link'

describe('chatNotificationLink', () => {
  // #1940.1 / #1940.7 — UN SEUL ENDROIT (GA-26) pour le lien d'une
  // notification de chat : une mention (#1940.1) et une assignation de carte
  // (#1940.7) renvoient toutes deux vers le fil qui les a produites.
  it('#1940.1 / #1940.7 — porte le fil ET le compte quand les deux sont connus', () => {
    expect(chatNotificationLink({ conversationId: 'conv-1', accountId: 'a-1' })).toBe(
      '/chat?conversationId=conv-1&accountId=a-1',
    )
  })

  it('porte seulement le fil quand le compte est inconnu', () => {
    expect(chatNotificationLink({ conversationId: 'conv-1', accountId: null })).toBe('/chat?conversationId=conv-1')
  })

  it('replie sur le compte seul quand le fil est inconnu', () => {
    expect(chatNotificationLink({ conversationId: null, accountId: 'a-1' })).toBe('/chat?accountId=a-1')
  })

  it('replie sur /chat nu quand ni le fil ni le compte ne sont connus', () => {
    expect(chatNotificationLink({ conversationId: null, accountId: null })).toBe('/chat')
  })
})

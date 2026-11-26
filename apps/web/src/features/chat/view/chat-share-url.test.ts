import { describe, expect, it } from 'vitest'
import { chatShareUrl } from './chat-share-url'

/**
 * #1953.9 — CHAQUE RÉPONSE PORTE SON PROPRE PARTAGE, SUR LE MÊME LIEN
 * CLOISONNÉ QUE `ShareConversation`.
 *
 * Un réglage vit à un seul endroit (GA-26) : le fil est team-scopé côté
 * SERVEUR (`ShareConversation.tsx`), et ce module ne fait que composer l'URL —
 * jamais une seconde décision de portée. `messageId` est un paramètre EN PLUS,
 * jamais un chemin différent.
 */
describe('chatShareUrl', () => {
  const origin = 'https://app.example.test'

  it('sans compte ni fil ni message, rend juste `/chat`', () => {
    expect(chatShareUrl(origin, { accountId: null, conversationId: null, messageId: null })).toBe(`${origin}/chat`)
  })

  it('porte la PORTÉE (compte + fil), comme `ShareConversation`', () => {
    const url = chatShareUrl(origin, { accountId: 'acc-1', conversationId: 'conv-9', messageId: null })
    expect(url).toBe(`${origin}/chat?accountId=acc-1&conversationId=conv-9`)
  })

  it('#1953.9 — un `messageId` désigne CETTE réponse précisément, en plus de la portée', () => {
    const url = chatShareUrl(origin, { accountId: 'acc-1', conversationId: 'conv-9', messageId: 'msg-42' })
    expect(url).toBe(`${origin}/chat?accountId=acc-1&conversationId=conv-9&messageId=msg-42`)
  })

  it('un message sans identifiant enregistré (pas encore persisté) n’ajoute rien — pas d’ancre fantôme', () => {
    const url = chatShareUrl(origin, { accountId: null, conversationId: 'conv-9', messageId: null })
    expect(url).toBe(`${origin}/chat?conversationId=conv-9`)
  })
})

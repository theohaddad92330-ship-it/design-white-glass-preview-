import { describe, expect, it } from 'vitest'
import { searchWhileOnChat } from './search-while-on-chat'

describe('searchWhileOnChat (#3452)', () => {
  const last: Record<string, unknown> = { conversationId: 'c1' }
  it('sur /chat, suit la recherche courante', () => {
    expect(searchWhileOnChat({ pathname: '/chat', search: { conversationId: 'c2' } }, last)).toEqual({
      conversationId: 'c2',
    })
  })
  it('vers /discover (écran suivant en chargement), garde la dernière recherche de /chat', () => {
    expect(searchWhileOnChat({ pathname: '/discover', search: { from: 'chat:c1' } }, last)).toBe(last)
  })
  it('un chemin qui commence seulement par « chat » n’est pas /chat', () => {
    expect(searchWhileOnChat({ pathname: '/chatbots', search: {} }, last)).toBe(last)
  })
  it('sans pathname (double de test), lit la recherche courante', () => {
    expect(searchWhileOnChat({ search: { a: 1 } }, last)).toEqual({ a: 1 })
  })
})

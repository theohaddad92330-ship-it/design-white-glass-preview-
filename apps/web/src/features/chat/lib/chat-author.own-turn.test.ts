import { describe, expect, it } from 'vitest'
import { isOwnTurn } from './chat-author'

const me = { firstName: 'Louis', avatarUrl: null }
const reply = { role: 'assistant' as const }

describe('isOwnTurn (#4016.L3.a)', () => {
  it('est vrai pour une question tapée dans cet onglet, ou signée de mon prénom', () => {
    expect(isOwnTurn([{ role: 'user' }, reply], 1, me)).toBe(true)
    expect(isOwnTurn([{ role: 'user', author: { firstName: 'Louis', avatarUrl: null } }, reply], 1, me)).toBe(true)
  })

  it('sait dire NON : un collègue, un auteur non résolu, rien avant, mon prénom inconnu', () => {
    expect(isOwnTurn([{ role: 'user', author: { firstName: 'Sarah', avatarUrl: null } }, reply], 1, me)).toBe(false)
    expect(isOwnTurn([{ role: 'user', author: null }, reply], 1, me)).toBe(false)
    expect(isOwnTurn([reply], 0, me)).toBe(false)
    expect(isOwnTurn([{ role: 'user', author: { firstName: 'Louis', avatarUrl: null } }, reply], 1, null)).toBe(false)
  })

  it('lit la dernière question qui précède, pas la première du fil', () => {
    const thread = [
      { role: 'user' as const, author: { firstName: 'Sarah', avatarUrl: null } },
      reply,
      { role: 'user' as const },
      reply,
    ]
    expect(isOwnTurn(thread, 1, me)).toBe(false)
    expect(isOwnTurn(thread, 3, me)).toBe(true)
  })
})

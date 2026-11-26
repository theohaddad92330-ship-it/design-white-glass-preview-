import { resolveChatMentions } from './chat-mentions'

describe('resolveChatMentions', () => {
  const members = [
    { userId: 'u-alice', fullName: 'Alice Martin' },
    { userId: 'u-bob', fullName: 'Bob Durand' },
    { userId: 'u-noname', fullName: null },
  ]

  it('#1940.1 — resolves a first-name mention to the matching member', () => {
    expect(resolveChatMentions('Peux-tu voir ça avec @Alice ?', members, 'u-bob')).toEqual([
      { userId: 'u-alice', fullName: 'Alice Martin' },
    ])
  })

  it('resolves a full-name mention', () => {
    expect(resolveChatMentions('@Bob Durand, à toi de jouer', members, 'u-alice')).toEqual([
      { userId: 'u-bob', fullName: 'Bob Durand' },
    ])
  })

  it('never notifies the author, even when they mention themselves', () => {
    expect(resolveChatMentions('@Alice je note pour moi-même', members, 'u-alice')).toEqual([])
  })

  it('returns each mentioned member once, even mentioned twice', () => {
    expect(resolveChatMentions('@Alice et encore @Alice', members, 'u-bob')).toEqual([
      { userId: 'u-alice', fullName: 'Alice Martin' },
    ])
  })

  it('returns nothing when nobody is mentioned', () => {
    expect(resolveChatMentions('Aucune mention ici', members, 'u-bob')).toEqual([])
  })

  it('never invents a member without a resolved name', () => {
    // A member with `fullName: null` can never be textually mentioned — no crash, no match.
    expect(resolveChatMentions('@Personne', members, 'u-bob')).toEqual([])
  })
})

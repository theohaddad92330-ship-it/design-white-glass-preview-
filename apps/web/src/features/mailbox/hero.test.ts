import { describe, expect, it } from 'vitest'
import { mailboxFirstThreadToTreat, mailboxHeroSegments } from './hero'

function thread(id: string) {
  return {
    threadId: id,
    subject: null,
    counterpart: null,
    lastMessageAt: null,
    lastDirection: 'inbound' as const,
    messageCount: 1,
    awaitingReply: true,
    daysSinceLastMessage: null,
    unread: false,
    hasAttachments: false,
    otherParticipants: [],
  }
}

describe('mailboxHeroSegments (#2113.17)', () => {
  it('ne compte que ce qui a une valeur strictement positive (GA-18/19)', () => {
    const segments = mailboxHeroSegments({ toTreat: [thread('a')], followUps: [] })
    expect(segments).toEqual([{ key: 'toTreat', count: 1 }])
  })

  it('rend les deux segments quand les deux comptent quelque chose', () => {
    const segments = mailboxHeroSegments({ toTreat: [thread('a')], followUps: [thread('b'), thread('c')] })
    expect(segments).toEqual([
      { key: 'toTreat', count: 1 },
      { key: 'followUps', count: 2 },
    ])
  })

  it('rien à traiter et rien à relancer : aucun segment (pas de zéro affiché)', () => {
    expect(mailboxHeroSegments({ toTreat: [], followUps: [] })).toEqual([])
  })
})

describe('mailboxFirstThreadToTreat (#2113.18)', () => {
  it('propose une réponse favorable en premier — elle a déjà donné un signal', () => {
    const toTreat = [thread('positive-1')]
    const followUps = [thread('followup-1')]
    expect(mailboxFirstThreadToTreat({ toTreat, followUps })?.threadId).toBe('positive-1')
  })

  it('retombe sur une relance quand rien n’attend de réponse favorable', () => {
    const followUps = [thread('followup-1')]
    expect(mailboxFirstThreadToTreat({ toTreat: [], followUps })?.threadId).toBe('followup-1')
  })

  it('ne propose rien quand il n’y a ni l’un ni l’autre', () => {
    expect(mailboxFirstThreadToTreat({ toTreat: [], followUps: [] })).toBeNull()
  })
})

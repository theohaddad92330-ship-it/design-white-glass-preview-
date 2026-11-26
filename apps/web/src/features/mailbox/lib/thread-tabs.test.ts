import type { MailThread } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { splitThreadsByTab, threadIsDone } from './thread-tabs'

function thread(threadId: string, state?: MailThread['state']): MailThread {
  return {
    threadId,
    subject: threadId,
    counterpart: null,
    lastMessageAt: null,
    lastDirection: 'inbound',
    messageCount: 1,
    awaitingReply: false,
    daysSinceLastMessage: null,
    unread: false,
    hasAttachments: false,
    otherParticipants: [],
    ...(state ? { state } : {}),
  } as MailThread
}

// Théo B m1.R2 / m1.N1 — « À traiter » et « Historique » se lisent sur l'état du fil, jamais sur une copie locale.
describe('thread-tabs', () => {
  it('traité et non pertinent sont de l’Historique', () => {
    expect(threadIsDone(thread('a', 'treated'))).toBe(true)
    expect(threadIsDone(thread('b', 'irrelevant'))).toBe(true)
  })

  it('un fil sans état, ou en attente, reste à traiter', () => {
    expect(threadIsDone(thread('a'))).toBe(false)
    expect(threadIsDone(thread('b', 'unread'))).toBe(false)
  })

  it('range chaque fil dans UN seul onglet, sans en perdre', () => {
    const all = [thread('a'), thread('b', 'treated'), thread('c', 'irrelevant'), thread('d')]
    const { todo, history } = splitThreadsByTab(all)
    expect(todo.map(t => t.threadId)).toEqual(['a', 'd'])
    expect(history.map(t => t.threadId)).toEqual(['b', 'c'])
    expect(todo.length + history.length).toBe(all.length)
  })

  // Théo B M2.N3 — un fil REPORTÉ quitte « À traiter » jusqu'à sa date : il se retrouve dans « À venir ».
  it('un fil reporté à une date future n’est pas à traiter ; un report échu y revient', () => {
    const now = new Date('2026-10-23T10:00:00.000Z')
    const later = { ...thread('later'), snoozeUntil: '2026-10-27T09:00:00.000Z' }
    const past = { ...thread('past'), snoozeUntil: '2026-10-20T09:00:00.000Z' }
    const { todo, upcoming, history } = splitThreadsByTab([later, past, thread('b', 'treated')], now)
    expect(todo.map(t => t.threadId)).toEqual(['past'])
    expect(upcoming.map(t => t.threadId)).toEqual(['later'])
    expect(todo.length + upcoming.length + history.length).toBe(3)
  })
})

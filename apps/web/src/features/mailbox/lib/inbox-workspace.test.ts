import type { MailThread } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  accountOptionsOf,
  counterpartNameOf,
  filterInboxThreads,
  initialsOf,
  mergeIntentResults,
} from './inbox-workspace'

function thread(overrides: Partial<MailThread> & { threadId: string }): MailThread {
  return {
    subject: 'Objet',
    counterpart: 'claire.vasseur@groupe-helios.fr',
    lastMessageAt: '2026-10-22T09:42:00.000Z',
    lastDirection: 'inbound',
    messageCount: 1,
    awaitingReply: false,
    daysSinceLastMessage: 1,
    unread: false,
    hasAttachments: false,
    otherParticipants: [],
    ...overrides,
  }
}

describe('mergeIntentResults — plusieurs intentions, une seule file', () => {
  it('un fil trouvé par deux intentions n’apparaît qu’une fois, avec la PREMIÈRE intention qui l’a trouvé', () => {
    const shared = thread({ threadId: 't1' })
    const merged = mergeIntentResults([
      { intent: 'unread', threads: [shared] },
      { intent: 'budget', threads: [shared, thread({ threadId: 't2' })] },
    ])
    expect(merged.map(row => [row.thread.threadId, row.foundBy])).toEqual([
      ['t1', 'unread'],
      ['t2', 'budget'],
    ])
  })

  it('trie par niveau de priorité serveur, puis du plus récent au plus ancien', () => {
    const merged = mergeIntentResults([
      {
        intent: 'free',
        threads: [
          thread({ threadId: 'old-urgent', priorityLevel: 1, lastMessageAt: '2026-10-01T00:00:00.000Z' }),
          thread({ threadId: 'recent-calm', priorityLevel: 5, lastMessageAt: '2026-10-22T00:00:00.000Z' }),
          thread({ threadId: 'recent-urgent', priorityLevel: 1, lastMessageAt: '2026-10-21T00:00:00.000Z' }),
          thread({ threadId: 'unknown-level', lastMessageAt: '2026-10-23T00:00:00.000Z' }),
        ],
      },
    ])
    expect(merged.map(row => row.thread.threadId)).toEqual([
      'recent-urgent',
      'old-urgent',
      'recent-calm',
      'unknown-level',
    ])
  })
})

describe('filterInboxThreads — comptes et non-lus, sans rien inventer', () => {
  const helios = thread({ threadId: 'h', account: { id: 'a2', name: 'Groupe Hélios', via: 'contact' }, unread: true })
  const nova = thread({ threadId: 'n', account: { id: 'a3', name: 'NovaSanté', via: 'domain' } })
  const orphan = thread({ threadId: 'o', account: null })

  it('aucun compte choisi : tous les fils', () => {
    expect(filterInboxThreads([helios, nova, orphan], { accountIds: [], unreadOnly: false })).toHaveLength(3)
  })

  it('multi-sélection de comptes : l’union, jamais un fil sans compte', () => {
    expect(
      filterInboxThreads([helios, nova, orphan], { accountIds: ['a2', 'a3'], unreadOnly: false }).map(t => t.threadId),
    ).toEqual(['h', 'n'])
  })

  it('« seulement les non lus »', () => {
    expect(filterInboxThreads([helios, nova], { accountIds: [], unreadOnly: true }).map(t => t.threadId)).toEqual(['h'])
  })
})

describe('accountOptionsOf — les comptes présents dans la file, pas un portefeuille deviné', () => {
  it('uniques, triés par nom ; un fil sans compte n’en fabrique aucun', () => {
    expect(
      accountOptionsOf([
        thread({ threadId: '1', account: { id: 'a3', name: 'NovaSanté', via: 'domain' } }),
        thread({ threadId: '2', account: { id: 'a2', name: 'Groupe Hélios', via: 'contact' } }),
        thread({ threadId: '3', account: { id: 'a3', name: 'NovaSanté', via: 'domain' } }),
        thread({ threadId: '4', account: null }),
      ]),
    ).toEqual([
      { id: 'a2', name: 'Groupe Hélios' },
      { id: 'a3', name: 'NovaSanté' },
    ])
  })
})

describe('counterpartNameOf — le nom lu dans l’en-tête du message, sinon l’adresse en clair', () => {
  it('reprend le nom affiché de l’expéditeur qui EST l’interlocuteur', () => {
    const t = thread({
      threadId: 'x',
      messages: [
        {
          id: 'm1',
          threadId: 'x',
          subject: null,
          from: 'Claire Vasseur <Claire.Vasseur@groupe-helios.fr>',
          to: [],
          cc: [],
          date: null,
          snippet: null,
          unread: false,
          hasAttachments: false,
          direction: 'inbound',
        },
      ],
    })
    expect(counterpartNameOf(t)).toBe('Claire Vasseur')
  })

  it('sans nom affiché : l’adresse elle-même, jamais un nom deviné', () => {
    expect(counterpartNameOf(thread({ threadId: 'y' }))).toBe('claire.vasseur@groupe-helios.fr')
  })

  it('sans interlocuteur : null', () => {
    expect(counterpartNameOf(thread({ threadId: 'z', counterpart: null }))).toBeNull()
  })
})

describe('initialsOf', () => {
  it('deux initiales d’un nom, une d’une adresse', () => {
    expect(initialsOf('Julien Mercier')).toBe('JM')
    expect(initialsOf('claire.vasseur@groupe-helios.fr')).toBe('C')
  })
})

import type { MailThread, MyMessageDraftItem, OutreachMessage, ScheduledMessageSendItem } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  draftOriginCounts,
  filterDraftsByOrigin,
  historyThreads,
  mergeDraftRows,
  upcomingThreads,
  type DraftRow,
} from './mailbox-views'

const SEQ_1 = '00000000-0000-4000-8000-0000000000e1'
const SEQ_2 = '00000000-0000-4000-8000-0000000000e2'

function draft(overrides: Partial<MyMessageDraftItem>): MyMessageDraftItem {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    contactId: '00000000-0000-4000-8000-0000000000c1',
    channel: 'email',
    subject: 'Objet',
    body: 'Corps',
    editedSubject: null,
    editedBody: null,
    usedTemplateSource: null,
    usedTemplateVersion: null,
    usedStyleId: null,
    unchanged: false,
    angle: null,
    createdAt: '2026-10-22T08:00:00.000Z',
    validatedAt: null,
    contactName: 'Paul Ferrer',
    contactEmail: 'paul.ferrer@altiver.example',
    accountId: null,
    accountName: 'Altiver Industries',
    versionCount: 1,
    ...overrides,
  }
}

function outreach(overrides: Partial<OutreachMessage>): OutreachMessage {
  return {
    id: '00000000-0000-4000-8000-0000000000a1',
    contact_id: '00000000-0000-4000-8000-0000000000c2',
    contact_name: 'Léa Robert',
    contact_role: null,
    account_name: 'Méridien Banque',
    channel: 'email',
    intent: 'prospecting',
    source: 'sequences',
    reason: null,
    status: 'needs_review',
    sequence_id: SEQ_1,
    sequence_step_id: null,
    asset_id: null,
    owner_id: '00000000-0000-4000-8000-0000000000f1',
    current_version: 1,
    message_style_template_id: null,
    message_style_template_version: null,
    subject: 'Le bon interlocuteur',
    body: 'Bonjour Léa',
    versions: [],
    approval: null,
    view: 'to_review',
    blockers: [],
    risks: [],
    can_approve: true,
    required_permission: 'messages:send',
    created_at: '2026-10-20T08:00:00.000Z',
    updated_at: '2026-10-20T08:00:00.000Z',
    ...overrides,
  } as OutreachMessage
}

describe('Théo B m2-brouillons.N1 — les brouillons de toutes les origines, en une liste', () => {
  it('un brouillon de fiche contact est « Contact » ; un e-mail de suivi est « Réponse » ; un message de séquence est « Séquence »', () => {
    const rows = mergeDraftRows(
      [
        draft({ id: 'd1', createdAt: '2026-10-22T08:00:00.000Z' }),
        draft({ id: 'd2', channel: 'follow_up_email', createdAt: '2026-10-21T08:00:00.000Z' }),
      ],
      [outreach({ id: 'o1', created_at: '2026-10-20T08:00:00.000Z' })],
    )
    expect(rows.map(r => [r.key, r.origin])).toEqual([
      ['draft:d1', 'contact'],
      ['draft:d2', 'reply'],
      ['outreach:o1', 'sequence'],
    ])
  })

  it('le contenu EFFECTIF d’un brouillon est la correction du commercial, sinon le texte préparé ; le destinataire reste en clair', () => {
    const [row] = mergeDraftRows([draft({ editedSubject: 'Objet corrigé', editedBody: 'Corps corrigé' })], [])
    expect(row).toMatchObject({
      subject: 'Objet corrigé',
      body: 'Corps corrigé',
      contactEmail: 'paul.ferrer@altiver.example',
    })
  })

  it('« Validé » = une validation existe (brouillon) ou le message est approuvé (séquence) ; sinon « à relire »', () => {
    const rows = mergeDraftRows(
      [
        draft({ id: 'd1', validatedAt: '2026-10-21T09:00:00.000Z', createdAt: '2026-10-22T08:00:00.000Z' }),
        draft({ id: 'd2', createdAt: '2026-10-22T07:00:00.000Z' }),
      ],
      [
        outreach({ id: 'o1', view: 'ready', status: 'approved', created_at: '2026-10-22T06:00:00.000Z' }),
        outreach({ id: 'o2', created_at: '2026-10-22T05:00:00.000Z' }),
      ],
    )
    expect(rows.map(r => r.validated)).toEqual([true, false, true, false])
  })

  it('un message de séquence déjà parti, échoué ou hors centre n’est pas un brouillon ; un message hors séquence est déjà un brouillon de contact', () => {
    const rows = mergeDraftRows(
      [],
      [
        outreach({ id: 'executed', view: 'executed' }),
        outreach({ id: 'failed', view: 'failed' }),
        outreach({ id: 'none', view: null }),
        outreach({ id: 'solo', sequence_id: null }),
        outreach({ id: 'kept', view: 'blocked', blockers: ['opted_out'] }),
      ],
    )
    expect(rows.map(r => r.id)).toEqual(['kept'])
    expect(rows[0]).toMatchObject({ blockers: ['opted_out'], sequenceId: SEQ_1 })
  })

  it('trie du plus récent au plus ancien et compte par origine, sans jamais inventer un zéro pour une origine absente', () => {
    const rows: DraftRow[] = mergeDraftRows(
      [
        draft({ id: 'old', createdAt: '2026-10-19T08:00:00.000Z' }),
        draft({ id: 'new', createdAt: '2026-10-22T08:00:00.000Z' }),
      ],
      [],
    )
    expect(rows.map(r => r.id)).toEqual(['new', 'old'])
    expect(draftOriginCounts(rows)).toEqual({ all: 2, contact: 2 })
    expect(filterDraftsByOrigin(rows, 'sequence')).toEqual([])
    expect(filterDraftsByOrigin(rows, 'all')).toHaveLength(2)
  })

  it('le filtre « sequence » peut viser UNE séquence (vue des messages d’une séquence)', () => {
    const rows = mergeDraftRows([], [outreach({ id: 'a' }), outreach({ id: 'b', sequence_id: SEQ_2 })])
    expect(filterDraftsByOrigin(rows, 'sequence', SEQ_2).map(r => r.id)).toEqual(['b'])
  })
})

function thread(overrides: Partial<MailThread>): MailThread {
  return {
    threadId: 't1',
    subject: 'Re: périmètre',
    counterpart: 'claire.martin@novasante.example',
    lastMessageAt: '2026-10-22T08:20:00.000Z',
    lastDirection: 'inbound',
    messageCount: 2,
    awaitingReply: false,
    daysSinceLastMessage: 0,
    unread: false,
    hasAttachments: false,
    otherParticipants: [],
    ...overrides,
  }
}

function send(overrides: Partial<ScheduledMessageSendItem>): ScheduledMessageSendItem {
  return {
    id: 's1',
    versionId: 'v1',
    contactId: 'c1',
    channel: 'email',
    subject: 'Relance',
    scheduledAt: '2026-10-27T08:00:00.000Z',
    timeZone: 'Europe/Paris',
    status: 'scheduled',
    attemptedAt: null,
    sentAt: null,
    proofSentAt: null,
    failureCode: null,
    createdAt: '2026-10-22T08:00:00.000Z',
    ...overrides,
  }
}

describe('Théo B m2-brouillons.N3 / N4 — « À venir » et « Historique »', () => {
  const now = new Date('2026-10-22T10:00:00.000Z')

  it('« À venir » : les fils reportés à une date future, le plus proche d’abord', () => {
    const rows = upcomingThreads(
      [
        thread({ threadId: 'late', snoozeUntil: '2026-10-30T07:00:00.000Z' }),
        thread({ threadId: 'soon', snoozeUntil: '2026-10-27T07:00:00.000Z' }),
        thread({ threadId: 'none' }),
        thread({ threadId: 'past', snoozeUntil: '2026-10-21T07:00:00.000Z' }),
      ],
      now,
    )
    expect(rows.map(r => r.threadId)).toEqual(['soon', 'late'])
  })

  it('« Historique » : les échanges traités, le plus récent d’abord — un fil non pertinent ou ouvert n’y est pas', () => {
    const rows = historyThreads([
      thread({ threadId: 'old', state: 'treated', lastMessageAt: '2026-10-13T10:00:00.000Z' }),
      thread({ threadId: 'new', state: 'treated', lastMessageAt: '2026-10-16T10:00:00.000Z' }),
      thread({ threadId: 'open', state: 'unread' }),
      thread({ threadId: 'irrelevant', state: 'irrelevant' }),
    ])
    expect(rows.map(r => r.threadId)).toEqual(['new', 'old'])
  })

  it('« Historique » garde aussi les envois PARTIS avec preuve — « Envoyé le » n’existe qu’avec la preuve', () => {
    const rows = historyThreads(
      [],
      [
        send({
          id: 'proven',
          status: 'sent',
          sentAt: '2026-10-13T08:00:00.000Z',
          proofSentAt: '2026-10-13T08:04:00.000Z',
        }),
        send({ id: 'unproven', status: 'sent', sentAt: '2026-10-14T08:00:00.000Z' }),
        send({ id: 'waiting' }),
      ],
    )
    expect(rows.map(r => r.sendId)).toEqual(['proven'])
  })
})

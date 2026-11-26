import type {
  MailThread,
  MyMessageDraftItem,
  OutreachBlocker,
  OutreachMessage,
  ScheduledMessageSendItem,
} from '@bellum/contracts'

/** Les quatre vues de la Messagerie (Théo B m2-brouillons.R1) ; « À traiter » reste l'écran d'origine. */
export const MAILBOX_VIEWS = ['inbox', 'drafts', 'scheduled', 'history'] as const
export type MailboxView = (typeof MAILBOX_VIEWS)[number]

type DraftOrigin = 'contact' | 'reply' | 'sequence'
export type DraftOriginFilter = 'all' | DraftOrigin

/**
 * Une ligne de « Messages à relire », qu'elle vienne d'un brouillon de fiche contact (`message_draft_versions`) ou
 * d'un message de séquence en attente d'approbation (`outreach_messages`) : UNE liste, le même objet que partout.
 */
export type DraftRow = {
  key: string
  source: 'draft' | 'outreach'
  id: string
  origin: DraftOrigin
  channel: string
  contactId: string
  contactName: string | null
  contactEmail: string | null
  accountName: string | null
  subject: string | null
  body: string
  validated: boolean
  validatedAt: string | null
  createdAt: string
  versionCount: number
  /** Pourquoi ce message ne peut pas partir (désabonné, adresse absente…) — vide quand rien ne l'empêche. */
  blockers: OutreachBlocker[]
  sequenceId: string | null
  /** Version affichée d'un message de séquence — l'approbation vise cette version précise. */
  outreachVersion: number | null
}

/** Ce qui reste à relire dans le centre d'approbation : ni parti, ni échoué, ni hors centre. */
const REVIEWABLE_OUTREACH_VIEWS = new Set(['to_review', 'modified', 'blocked', 'ready'])

export function mergeDraftRows(drafts: MyMessageDraftItem[], messages: OutreachMessage[]): DraftRow[] {
  const fromDrafts: DraftRow[] = drafts.map(item => ({
    key: `draft:${item.id}`,
    source: 'draft',
    id: item.id,
    origin: item.channel === 'follow_up_email' ? 'reply' : 'contact',
    channel: item.channel,
    contactId: item.contactId,
    contactName: item.contactName,
    contactEmail: item.contactEmail,
    accountName: item.accountName,
    subject: item.editedSubject ?? item.subject,
    body: item.editedBody ?? item.body,
    validated: item.validatedAt !== null,
    validatedAt: item.validatedAt,
    createdAt: item.createdAt,
    versionCount: item.versionCount,
    blockers: [],
    sequenceId: null,
    outreachVersion: null,
  }))
  // Un message hors séquence est déjà un brouillon de contact : le montrer ici le dédoublerait.
  const fromSequences: DraftRow[] = messages
    .filter(
      message => message.sequence_id !== null && message.view !== null && REVIEWABLE_OUTREACH_VIEWS.has(message.view),
    )
    .map(message => ({
      key: `outreach:${message.id}`,
      source: 'outreach',
      id: message.id,
      origin: 'sequence',
      channel: message.channel,
      contactId: message.contact_id,
      contactName: message.contact_name,
      contactEmail: null,
      accountName: message.account_name,
      subject: message.subject,
      body: message.body,
      validated: message.view === 'ready',
      validatedAt: message.approval ? message.updated_at : null,
      createdAt: message.created_at,
      versionCount: message.current_version,
      blockers: message.blockers,
      sequenceId: message.sequence_id,
      outreachVersion: message.current_version,
    }))
  return [...fromDrafts, ...fromSequences].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function filterDraftsByOrigin(rows: DraftRow[], origin: DraftOriginFilter, sequenceId?: string): DraftRow[] {
  const byOrigin = origin === 'all' ? rows : rows.filter(row => row.origin === origin)
  return sequenceId ? byOrigin.filter(row => row.sequenceId === sequenceId) : byOrigin
}

/** « Tous » plus chaque origine PRÉSENTE : une origine absente n'apparaît pas (jamais un « 0 » inventé). */
export function draftOriginCounts(rows: DraftRow[]): Partial<Record<DraftOriginFilter, number>> {
  const counts: Partial<Record<DraftOriginFilter, number>> = { all: rows.length }
  for (const row of rows) {
    const seen = counts[row.origin]
    counts[row.origin] = seen === undefined ? 1 : seen + 1
  }
  return counts
}

/** « À venir » côté fils : reportés à une date encore future, le retour le plus proche d'abord. */
export function upcomingThreads(threads: MailThread[], now: Date = new Date()): MailThread[] {
  return threads
    .filter(thread => thread.snoozeUntil && new Date(thread.snoozeUntil).getTime() > now.getTime())
    .sort((a, b) => (a.snoozeUntil ?? '').localeCompare(b.snoozeUntil ?? ''))
}

/** Une ligne du journal : un échange traité, ou un envoi parti AVEC la preuve (message retrouvé dans les éléments envoyés). */
export type HistoryRow = {
  threadId: string | null
  sendId: string | null
  at: string
  thread: MailThread | null
  send: ScheduledMessageSendItem | null
}

export function historyThreads(threads: MailThread[], sends: ScheduledMessageSendItem[] = []): HistoryRow[] {
  const treated: HistoryRow[] = threads
    .filter(thread => thread.state === 'treated')
    .map(thread => ({ threadId: thread.threadId, sendId: null, at: thread.lastMessageAt ?? '', thread, send: null }))
  const sent: HistoryRow[] = sends
    .filter(send => send.status === 'sent' && send.proofSentAt !== null)
    .map(send => ({ threadId: null, sendId: send.id, at: send.proofSentAt ?? '', thread: null, send }))
  return [...treated, ...sent].sort((a, b) => b.at.localeCompare(a.at))
}

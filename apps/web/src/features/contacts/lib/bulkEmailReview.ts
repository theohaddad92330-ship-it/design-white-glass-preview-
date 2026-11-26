import { buildBulkPreflight } from '@/features/contacts/lib/bulkEmail'

/**
 * #4042 — la REVUE de l'envoi groupé, une personne à la fois. Pur, sans React :
 * chaque mail est SON état (objet, corps, pièces, exclusion) ; éditer l'un ne
 * touche jamais les autres, et l'envoi ne s'ouvre qu'une fois la revue finie.
 * Rien ici n'envoie : la porte {@link sendGate} dit seulement si le geste du
 * commercial peut partir.
 */

type ReviewDraft = { subject: string; body: string }

/** Où en est le texte : en cours de lecture, déposé, absent, ou écrit à l'instant. */
type DraftOrigin = 'loading' | 'stored' | 'missing' | 'generated'

export type ReviewItem = {
  contactId: string
  fullName: string
  title: string | null
  entity: string | null
  email: string
  /** #4986.1 — date de l'estimation quand l'adresse est DEVINÉE (motif) ; `null` = adresse connue. */
  emailEstimatedAt: string | null
  origin: DraftOrigin
  subject: string
  body: string
  /** Le texte tel qu'il est arrivé (déposé ou généré) — de quoi savoir s'il a été modifié. */
  baseline: ReviewDraft
  /** La personne a vu ce mail (navigation ou édition) : un mail généré n'est plus « à revoir ». */
  reviewed: boolean
  excluded: boolean
  attachmentIds: string[]
}

/** L'état affiché : prêt / modifié / à revoir / exclu, plus les états d'attente. */
export type ReviewState = 'loading' | 'missing' | 'to_review' | 'ready' | 'modified' | 'excluded'

type ReviewContact = {
  id: string
  full_name: string
  title?: string | null
  entity?: string | null
  email: string | null
  email_estimated_at?: string | null
}

export function buildReviewItems(contacts: readonly ReviewContact[]): ReviewItem[] {
  // La même partition que partout : adresse lisible (#3698.7), plafond d'un lot.
  return buildBulkPreflight(contacts)
    .recipients.filter((contact): contact is ReviewContact & { email: string } => Boolean(contact.email))
    .map(contact => ({
      contactId: contact.id,
      fullName: contact.full_name,
      title: contact.title ?? null,
      entity: contact.entity ?? null,
      email: contact.email,
      emailEstimatedAt: contact.email_estimated_at ?? null,
      origin: 'loading',
      subject: '',
      body: '',
      baseline: { subject: '', body: '' },
      reviewed: false,
      excluded: false,
      attachmentIds: [],
    }))
}

export function itemState(item: ReviewItem): ReviewState {
  if (item.excluded) return 'excluded'
  if (item.origin === 'loading') return 'loading'
  if (item.origin === 'missing') return 'missing'
  if (item.subject !== item.baseline.subject || item.body !== item.baseline.body) return 'modified'
  if (item.origin === 'generated' && !item.reviewed) return 'to_review'
  return 'ready'
}

function patch(
  items: readonly ReviewItem[],
  contactId: string,
  change: (item: ReviewItem) => ReviewItem,
): ReviewItem[] {
  return items.map(item => (item.contactId === contactId ? change(item) : item))
}

/** Le brouillon déjà déposé sur la fiche — ou `null` : rien n'est préparé pour cette personne. */
export function withStoredDraft(items: readonly ReviewItem[], contactId: string, draft: ReviewDraft | null) {
  return patch(items, contactId, item =>
    draft && draft.body.trim()
      ? { ...item, origin: 'stored', subject: draft.subject, body: draft.body, baseline: { ...draft } }
      : { ...item, origin: 'missing', subject: '', body: '', baseline: { subject: '', body: '' } },
  )
}

/** Un mail écrit à la demande du commercial : « à revoir » tant qu'il ne l'a pas vu. */
export function withGeneratedDraft(items: readonly ReviewItem[], contactId: string, draft: ReviewDraft) {
  return patch(items, contactId, item => ({
    ...item,
    origin: 'generated',
    subject: draft.subject,
    body: draft.body,
    baseline: { ...draft },
    reviewed: false,
  }))
}

export function editItem(items: readonly ReviewItem[], contactId: string, change: Partial<ReviewDraft>) {
  return patch(items, contactId, item => ({ ...item, ...change, reviewed: true }))
}

export function markReviewed(items: readonly ReviewItem[], contactId: string) {
  return patch(items, contactId, item => (item.reviewed ? item : { ...item, reviewed: true }))
}

export function setExcluded(items: readonly ReviewItem[], contactId: string, excluded: boolean) {
  return patch(items, contactId, item => ({ ...item, excluded }))
}

/** Une pièce à UN mail (`[id]`) ou à tous ceux qui partent (`'all'`) — jamais deux fois la même. */
export function addAttachment(items: readonly ReviewItem[], assetId: string, target: 'all' | readonly string[]) {
  return items.map(item => {
    const targeted = target === 'all' ? !item.excluded : target.includes(item.contactId)
    if (!targeted || item.attachmentIds.includes(assetId)) return item
    return { ...item, attachmentIds: [...item.attachmentIds, assetId] }
  })
}

export function removeAttachment(items: readonly ReviewItem[], contactId: string, assetId: string) {
  return patch(items, contactId, item => ({
    ...item,
    attachmentIds: item.attachmentIds.filter(id => id !== assetId),
  }))
}

/** Ce qui partirait : les mails relus, non exclus, au texte non vide. */
export function sendTargets(items: readonly ReviewItem[]): ReviewItem[] {
  return items.filter(item => {
    const state = itemState(item)
    return state === 'ready' || state === 'modified'
  })
}

type SendGate =
  | { ok: true; count: number }
  | { ok: false; reason: 'no_mailbox' | 'demo' | 'pending' | 'nothing' | 'empty_body' | 'attachment_refused' }

/**
 * La porte de l'envoi. Elle ne l'effectue pas : le commercial clique, après la
 * revue, et seulement si sa messagerie est connectée (jamais d'envoi simulé).
 */
export function sendGate(
  items: readonly ReviewItem[],
  context: { mailboxReady: boolean; demo: boolean; attachmentRefused: (item: ReviewItem) => boolean },
): SendGate {
  if (context.demo) return { ok: false, reason: 'demo' }
  if (!context.mailboxReady) return { ok: false, reason: 'no_mailbox' }
  const pending = items.some(item => {
    const state = itemState(item)
    return state === 'loading' || state === 'missing' || state === 'to_review'
  })
  if (pending) return { ok: false, reason: 'pending' }
  const targets = sendTargets(items)
  if (targets.length === 0) return { ok: false, reason: 'nothing' }
  if (targets.some(item => !item.body.trim())) return { ok: false, reason: 'empty_body' }
  if (targets.some(context.attachmentRefused)) return { ok: false, reason: 'attachment_refused' }
  return { ok: true, count: targets.length }
}

import { COLLEAGUE_ACTIVITY_WINDOW_DAYS, COLLEAGUE_CONTACT_WINDOW_DAYS } from '@bellum/contracts'

/**
 * #4158.20 / .21 — la décision PURE des garde-fous entre collègues : aucune base,
 * aucun réseau. Le service lit, ce module tranche (et se teste sans mock).
 *
 * Doctrine : on informe, on ne bloque pas. « Moi » n'est jamais un collègue,
 * et une absence ne fait aucune ligne.
 */

const DAY_MS = 86_400_000

/** Jours ENTIERS écoulés entre `from` et `now`, jamais négatif. */
export function daysBetween(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY_MS))
}

/** Un envoi CONFIRMÉ par le transport. */
export const VERIFIED_OUTREACH_STATUSES = ['sent', 'delivered', 'replied'] as const
/** Un envoi DÉCLARÉ : le collègue a copié le message et dit l'avoir envoyé. */
export const DECLARED_OUTREACH_STATUSES = ['copied_manual'] as const

/**
 * Les types d'action du journal qui sont du TRAVAIL d'un collègue sur une fiche
 * (un message, un appel, un rendez-vous, une étape du plan, un statut). Une liste
 * BLANCHE : un événement système (score recalculé, profil mis à jour, analyse
 * terminée) ne dit rien à qui veut ne pas doubler un collègue, et « on n'affiche
 * pas ce qu'on n'a pas » interdit d'en faire une phrase.
 */
export const WORK_ACTION_TYPES = [
  'message_sent',
  'message_copied',
  'plan_action_completed',
  'plan_action_added',
  'plan_action_assigned',
  'plan_action_message_generated',
  'rdv_obtained',
  'deal_signed',
  'commercial_status_changed',
  'crm_task_created',
  'crm_export',
  'call',
  'email',
  'meeting',
  'note',
  'linkedin',
] as const

type ActivityInput = { user_id: string; action_type: string; created_at: Date }

type ColleagueActivityRow = {
  user_id: string
  is_responsible: boolean
  last_action: string | null
  last_action_at: string | null
}

/**
 * Les collègues (jamais moi) à nommer sur une fiche : le responsable, et ceux
 * qui y ont agi dans les 90 derniers jours. Le responsable d'abord, puis le plus
 * récent. Un responsable sans activité figure SANS action ni date inventées.
 */
export function pickColleagueActivities(input: {
  me: string
  responsibleId: string | null
  actions: readonly ActivityInput[]
  now: Date
}): ColleagueActivityRow[] {
  const { me, responsibleId, actions, now } = input
  const latest = new Map<string, ActivityInput>()
  for (const action of actions) {
    if (action.user_id === me) continue
    if (!(WORK_ACTION_TYPES as readonly string[]).includes(action.action_type)) continue
    if (daysBetween(action.created_at, now) > COLLEAGUE_ACTIVITY_WINDOW_DAYS) continue
    const seen = latest.get(action.user_id)
    if (!seen || action.created_at > seen.created_at) latest.set(action.user_id, action)
  }

  const rows: ColleagueActivityRow[] = [...latest.values()].map(action => ({
    user_id: action.user_id,
    is_responsible: action.user_id === responsibleId,
    last_action: action.action_type,
    last_action_at: action.created_at.toISOString(),
  }))
  if (responsibleId && responsibleId !== me && !latest.has(responsibleId)) {
    rows.push({ user_id: responsibleId, is_responsible: true, last_action: null, last_action_at: null })
  }
  return rows.sort((a, b) => {
    if (a.is_responsible !== b.is_responsible) return a.is_responsible ? -1 : 1
    return (b.last_action_at ?? '').localeCompare(a.last_action_at ?? '')
  })
}

type OutreachInput = { contact_id: string; user_id: string; status: string; at: Date }

type ColleagueContactRow = {
  by_user_id: string
  at: string
  days_ago: number
  proof: 'verified' | 'declared'
}

function proofFor(status: string): 'verified' | 'declared' | null {
  if ((VERIFIED_OUTREACH_STATUSES as readonly string[]).includes(status)) return 'verified'
  if ((DECLARED_OUTREACH_STATUSES as readonly string[]).includes(status)) return 'declared'
  return null
}

/**
 * Par contact, le contact le PLUS RÉCENT par un collègue (jamais moi) dans les
 * 30 derniers jours. Un brouillon, un échec ou un rebond n'est pas un contact.
 */
export function pickColleagueContacts(input: {
  me: string
  messages: readonly OutreachInput[]
  now: Date
}): Map<string, ColleagueContactRow> {
  const out = new Map<string, ColleagueContactRow>()
  for (const message of input.messages) {
    if (message.user_id === input.me) continue
    const proof = proofFor(message.status)
    if (!proof) continue
    const days = daysBetween(message.at, input.now)
    if (days > COLLEAGUE_CONTACT_WINDOW_DAYS) continue
    const seen = out.get(message.contact_id)
    if (seen && seen.at >= message.at.toISOString()) continue
    out.set(message.contact_id, {
      by_user_id: message.user_id,
      at: message.at.toISOString(),
      days_ago: days,
      proof,
    })
  }
  return out
}

/** Le domaine d'une URL, d'une adresse ou d'un nom nu ; `null` si ce n'en est pas un. */
export function normalizeDomain(raw: string): string | null {
  let value = raw.trim().toLowerCase()
  if (!value) return null
  if (value.includes('@')) value = value.slice(value.lastIndexOf('@') + 1)
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '')
  value = value.split(/[/?#]/)[0] ?? ''
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value) ? value : null
}

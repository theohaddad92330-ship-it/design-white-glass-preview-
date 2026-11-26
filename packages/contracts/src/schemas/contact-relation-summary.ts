import { INTERACTION_ACTIVITY_KINDS } from './activity.js'

/**
 * #3691 — où en est la relation avec UNE personne : dernière prise de contact,
 * dernier échange réel, prochaine action. Un seul calcul, partagé par la fiche
 * (et à réemployer par la liste et Laura — GA-26 : jamais une seconde écriture
 * de « ce qui compte comme un contact »).
 *
 * Les définitions communes (issue #3691) :
 *  - un e-mail envoyé sans réponse est une TENTATIVE, pas une conversation ;
 *  - une note, un enrichissement, un import, une activité interne, un brouillon,
 *    un envoi échoué ou de statut inconnu ne rajeunissent JAMAIS le dernier
 *    contact (la liste fermée est `INTERACTION_ACTIVITY_KINDS`, la même que la
 *    liste des contacts et le tableau de bord) ;
 *  - un échange RÉEL = une ligne entrante, une réunion tenue, ou un appel qui a
 *    abouti (issue autre que messagerie / sans réponse / mauvais contact) ;
 *  - « sans réponse » ne se garantit que si les réponses sont LUES : sans lecture
 *    fiable de la messagerie on dit « non vérifiable », jamais « sans réponse ».
 *
 * Aucune probabilité, aucun score : des dates et des objets réels.
 */

/** Issues d'appel qui prouvent qu'on a PARLÉ à quelqu'un (le reste = tentative). */
const CALL_OUTCOMES_NOT_REACHED: ReadonlySet<string> = new Set([
  'voicemail',
  'no_answer',
  'wrong_contact',
  'invalid_contact',
])

/** Verdicts qui NE prouvent PAS qu'une prise de contact est partie (brouillon, échec, statut inconnu). */
const VERDICTS_NOT_SENT: ReadonlySet<string> = new Set(['drafted', 'failed', 'unknown'])

export type RelationActivityInput = {
  id: string
  kind: string
  direction: 'inbound' | 'outbound' | 'internal' | null
  occurredAt: string
  verdict?: string | null
  outcome?: string | null
}

export type RelationPlanItemInput = {
  id: string
  label: string
  due_date: string | null
  execution_status: string
  owner_name: string | null
  outcome: string | null
  result: string | null
  completed_at: string | null
}

export type RelationTouch = { id: string; kind: string; at: string }

export type RelationNextAction = {
  id: string
  label: string
  /** `YYYY-MM-DD`, ou `null` : une tâche sans échéance n'est jamais datée à la volée. */
  dueDate: string | null
  owner: string | null
  state: 'overdue' | 'upcoming' | 'unscheduled'
}

export type ContactRelationSummary = {
  /** Au moins une tentative ou un échange enregistré. */
  hasHistory: boolean
  lastAttempt: RelationTouch | null
  lastExchange: RelationTouch | null
  /**
   * `yes` : dernière tentative plus récente que le dernier échange, réponses lues ;
   * `unverifiable` : même cas mais messagerie non lue ; `no` : un échange la suit ;
   * `none` : aucune tentative.
   */
  awaitingReply: 'yes' | 'unverifiable' | 'no' | 'none'
  next: RelationNextAction | null
  /** Autres actions ouvertes (accès au reste), sans la prochaine. */
  otherOpenCount: number
  lastOutcome: { outcome: string; result: string | null } | null
}

const INTERACTION_KINDS: ReadonlySet<string> = new Set(INTERACTION_ACTIVITY_KINDS)

function isCounted(activity: RelationActivityInput, now: Date): boolean {
  if (!INTERACTION_KINDS.has(activity.kind)) return false
  if (activity.direction === 'internal' || activity.direction === null) return false
  if (activity.verdict && VERDICTS_NOT_SENT.has(activity.verdict)) return false
  const at = Date.parse(activity.occurredAt)
  return Number.isFinite(at) && at <= now.getTime()
}

function isRealExchange(activity: RelationActivityInput): boolean {
  if (activity.direction === 'inbound') return true
  if (activity.kind === 'meeting') return true
  if (activity.kind === 'call') {
    return Boolean(activity.outcome) && !CALL_OUTCOMES_NOT_REACHED.has(activity.outcome as string)
  }
  return false
}

function latest(activities: RelationActivityInput[]): RelationTouch | null {
  let best: RelationActivityInput | null = null
  for (const activity of activities) {
    if (!best || Date.parse(activity.occurredAt) > Date.parse(best.occurredAt)) best = activity
  }
  return best ? { id: best.id, kind: best.kind, at: best.occurredAt } : null
}

function today(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export function summarizeContactRelation(input: {
  activities: readonly RelationActivityInput[]
  planItems: readonly RelationPlanItemInput[]
  /**
   * La messagerie est-elle CONNECTÉE et lue ? Sans elle, une tentative sans réponse
   * enregistrée ne prouve pas l'absence de réponse : le résumé dit « non vérifiable ».
   */
  repliesReadable: boolean
  now: Date
}): ContactRelationSummary {
  const counted = input.activities.filter(a => isCounted(a, input.now))
  const attempts = counted.filter(a => a.direction === 'outbound' || a.kind === 'meeting')
  const exchanges = counted.filter(isRealExchange)
  const lastAttempt = latest(attempts)
  const lastExchange = latest(exchanges)

  let awaitingReply: ContactRelationSummary['awaitingReply'] = 'none'
  if (lastAttempt) {
    const answered = lastExchange !== null && Date.parse(lastExchange.at) >= Date.parse(lastAttempt.at)
    if (answered) awaitingReply = 'no'
    else {
      awaitingReply = input.repliesReadable ? 'yes' : 'unverifiable'
    }
  }

  const open = input.planItems
    .filter(item => item.execution_status === 'todo')
    // Datées d'abord, la plus proche en tête (une relance en retard est la plus proche) ; sans échéance en dernier.
    .sort((a, b) => (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31'))
  const first = open[0] ?? null
  const next: RelationNextAction | null = first
    ? {
        id: first.id,
        label: first.label,
        dueDate: first.due_date,
        owner: first.owner_name,
        state: !first.due_date ? 'unscheduled' : first.due_date < today(input.now) ? 'overdue' : 'upcoming',
      }
    : null

  const lastDone =
    input.planItems
      .filter(item => item.execution_status === 'done' && item.outcome !== null)
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))[0] ?? null

  return {
    hasHistory: lastAttempt !== null || lastExchange !== null,
    lastAttempt,
    lastExchange,
    awaitingReply,
    next,
    otherOpenCount: Math.max(open.length - 1, 0),
    lastOutcome: lastDone?.outcome ? { outcome: lastDone.outcome, result: lastDone.result?.trim() || null } : null,
  }
}

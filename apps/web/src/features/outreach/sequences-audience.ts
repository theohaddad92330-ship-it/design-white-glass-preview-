import {
  canonicalSequenceStatus,
  type OutreachDisplayStatus,
  type OutreachSequence,
  type OutreachSequenceCanonicalStatus,
} from '@bellum/contracts'
import { displayStatusOf } from './sequences-cockpit'

/**
 * Théo C sequences-liste.R4 — LA LIGNE D'AUDIENCE.
 *
 * Louis a tranché le 22/10 : une campagne a une audience de PLUSIEURS contacts (renverse c74). Le
 * stockage reste une séquence par personne, réunies par `campaign_label` : la liste les REGROUPE en
 * une ligne « Séquence · Audience · Étapes · État », et chaque membre reste atteignable (sa page de
 * détail). Aucune donnée n'est inventée : tout ce que la ligne dit se calcule sur les membres.
 */

export type AudienceRow =
  | { kind: 'single'; sequence: OutreachSequence }
  | {
      kind: 'group'
      label: string
      members: OutreachSequence[]
      contactCount: number
      accountNames: string[]
      replies: number
      stepCount: number
      nextDueAt: string | null
      status: OutreachDisplayStatus
    }

// Ce qui demande ton attention passe avant ce qui court tranquillement, avant ce qui est fini.
const ATTENTION_ORDER: readonly OutreachDisplayStatus[] = [
  'failed',
  'awaiting_connection',
  'awaiting_validation',
  'scheduled',
  'prepared',
  'ready_to_copy',
  'paused',
  'responded',
  'completed',
  'refused',
  'bounced',
  'cancelled',
]

const rankOf = (status: OutreachDisplayStatus): number => ATTENTION_ORDER.indexOf(status)

export function groupByAudience(sequences: readonly OutreachSequence[], now: Date): AudienceRow[] {
  const byLabel = new Map<string, OutreachSequence[]>()
  for (const sequence of sequences) {
    if (!sequence.campaign_label) continue
    byLabel.set(sequence.campaign_label, [...(byLabel.get(sequence.campaign_label) ?? []), sequence])
  }
  const emitted = new Set<string>()
  const rows: AudienceRow[] = []
  for (const sequence of sequences) {
    const label = sequence.campaign_label
    const members = label ? (byLabel.get(label) ?? []) : []
    if (!label || members.length < 2) {
      rows.push({ kind: 'single', sequence })
      continue
    }
    if (emitted.has(label)) continue
    emitted.add(label)
    const statuses = members.map(member => displayStatusOf(member, now))
    const dues = members.flatMap(member => (member.next_step ? [member.next_step.due_at] : [])).sort()
    rows.push({
      kind: 'group',
      label,
      members,
      contactCount: new Set(members.map(member => member.contact_id)).size,
      accountNames: [...new Set(members.flatMap(member => (member.account_name ? [member.account_name] : [])))],
      replies: members.filter(member => member.contact_replied).length,
      stepCount: Math.max(...members.map(member => member.steps.length)),
      nextDueAt: dues[0] ?? null,
      status: statuses.reduce((best, current) => (rankOf(current) < rankOf(best) ? current : best)),
    })
  }
  return rows
}

/** Le filtre « état » : les onze états canoniques (`canonicalSequenceStatus`), `null` = tous. */
export function filterByCanonicalState(
  sequences: readonly OutreachSequence[],
  state: OutreachSequenceCanonicalStatus | null,
  now: Date,
): OutreachSequence[] {
  if (!state) return [...sequences]
  return sequences.filter(
    sequence => canonicalSequenceStatus(sequence.status, displayStatusOf(sequence, now)) === state,
  )
}

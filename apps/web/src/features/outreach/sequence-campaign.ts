import type { OutreachSequence, OutreachSequenceStep, OutreachStepKind } from '@bellum/contracts'

/**
 * Théo C sequences-detail — LA CAMPAGNE, lue sur ses séquences.
 *
 * Le stockage reste une séquence par personne, réunies par `campaign_label` (c131 : l'audience est multi-contacts,
 * ⚠️ renverse c74). La page de détail lit donc TOUTE l'audience à partir d'une seule séquence ouverte, et tout ce
 * qu'elle dit se calcule sur les membres : aucune donnée n'est inventée, une valeur absente ne fait aucune ligne.
 * Fonctions pures — l'horloge est un paramètre.
 */

/** Les séquences de la même campagne que `sequence` (elle comprise) ; une séquence lancée seule est sa propre campagne. */
export function campaignMembers(sequence: OutreachSequence, all: readonly OutreachSequence[]): OutreachSequence[] {
  const label = sequence.campaign_label
  if (!label) return [sequence]
  const members = all.filter(member => member.campaign_label === label)
  return members.some(member => member.id === sequence.id) ? members : [sequence, ...members]
}

export function campaignTitle(sequence: OutreachSequence): string {
  return sequence.campaign_label ?? sequence.name
}

function startOfDay(date: Date): number {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy.getTime()
}

function endOfDay(date: Date): number {
  const copy = new Date(date)
  copy.setHours(23, 59, 59, 999)
  return copy.getTime()
}

/** L'étape porte un e-mail rédigé (`payload.email_draft.body`). */
function hasDraft(step: OutreachSequenceStep): boolean {
  const draft = step.payload['email_draft']
  return (
    !!draft &&
    typeof draft === 'object' &&
    typeof (draft as { body?: unknown }).body === 'string' &&
    (draft as { body: string }).body.trim() !== ''
  )
}

type CampaignCounts = {
  contacts: number
  steps: number
  /** Étapes déclarées faites — « Fait » est déclaratif, jamais une preuve d'envoi. */
  stepsDone: number
  replies: number
  stopped: number
  started: string | null
}

export function campaignCounts(members: readonly OutreachSequence[]): CampaignCounts {
  const created = members.map(member => member.created_at).sort()
  return {
    contacts: new Set(members.map(member => member.contact_id)).size,
    steps: members.reduce((max, member) => Math.max(max, member.steps.length), 0),
    stepsDone: members.reduce((sum, member) => sum + member.steps.filter(step => step.status === 'done').length, 0),
    replies: members.filter(member => member.contact_replied).length,
    stopped: members.filter(member => member.status === 'cancelled').length,
    started: created[0] ?? null,
  }
}

type StepSummary = {
  position: number
  /** Une étape de référence (la plus complète) : son canal, son libellé, son brouillon. */
  step: OutreachSequenceStep
  /** Une étape de la même position qui porte déjà son brouillon rédigé, ou `null` : jamais un texte inventé. */
  drafted: OutreachSequenceStep | null
  done: number
  doneAt: string | null
  dueToday: number
  late: number
  upcoming: number
  nextDueAt: string | null
  skipped: number
  total: number
}

/** Un résumé par position d'étape, sur tous les membres. */
export function stepSummaries(members: readonly OutreachSequence[], now: Date): StepSummary[] {
  const positions = new Map<number, OutreachSequenceStep[]>()
  for (const member of members) {
    for (const step of member.steps) positions.set(step.position, [...(positions.get(step.position) ?? []), step])
  }
  const today0 = startOfDay(now)
  const today1 = endOfDay(now)
  return [...positions.entries()]
    .sort(([a], [b]) => a - b)
    .map(([position, steps]) => {
      const done = steps.filter(step => step.status === 'done')
      const pending = steps.filter(step => step.status === 'pending')
      const dueTimes = (list: OutreachSequenceStep[]) => list.map(step => new Date(step.due_at).getTime())
      const doneDates = done.map(step => step.done_at ?? step.due_at).sort()
      const future = pending.filter(step => new Date(step.due_at).getTime() > today1)
      return {
        position,
        // Une étape encore à faire porte le brouillon le plus récent ; à défaut, la première rencontrée.
        step: pending[0] ?? steps[0]!,
        drafted: steps.find(hasDraft) ?? null,
        done: done.length,
        doneAt: doneDates[0] ?? null,
        dueToday: dueTimes(pending).filter(time => time >= today0 && time <= today1).length,
        late: dueTimes(pending).filter(time => time < today0).length,
        upcoming: future.length,
        nextDueAt: future.map(step => step.due_at).sort()[0] ?? null,
        skipped: steps.filter(step => step.status === 'skipped').length,
        total: steps.length,
      }
    })
}

type MemberTone = 'green' | 'purple' | 'amber' | 'red' | 'neutral'
type MemberLine = {
  tone: MemberTone
  key: 'replied' | 'refused' | 'bounced' | 'stopped' | 'meeting' | 'completed' | 'paused' | 'dueNow' | 'next' | 'idle'
  /** Étape concernée (libellé court) et date, quand la ligne en a besoin. */
  stepKind?: OutreachStepKind
  date?: string
}

const REFUSAL_REASONS = new Set(['refusal', 'opt_out'])
const BOUNCE_REASONS = new Set(['invalid_address', 'hard_bounce'])

/** Où en est UNE personne de l'audience — un mot et une teinte, jamais un score. */
export function memberLine(member: OutreachSequence, now: Date): MemberLine {
  const reason = member.cancel_reason
  if (member.status === 'cancelled') {
    if (reason === 'meeting_booked' || reason === 'call_qualified') return { tone: 'green', key: 'meeting' }
    if (reason && REFUSAL_REASONS.has(reason)) return { tone: 'red', key: 'refused' }
    if (reason && BOUNCE_REASONS.has(reason)) return { tone: 'red', key: 'bounced' }
    if (member.contact_replied) return { tone: 'green', key: 'replied' }
    return { tone: 'neutral', key: 'stopped' }
  }
  if (member.contact_replied) return { tone: 'green', key: 'replied' }
  if (member.status === 'completed') return { tone: 'neutral', key: 'completed' }
  if (member.status === 'paused') return { tone: 'amber', key: 'paused' }
  const next = member.steps.find(step => step.status === 'pending')
  if (!next) return { tone: 'neutral', key: 'idle' }
  const due = new Date(next.due_at).getTime()
  if (due <= endOfDay(now)) return { tone: 'purple', key: 'dueNow', stepKind: next.kind, date: next.due_at }
  return { tone: 'neutral', key: 'next', stepKind: next.kind, date: next.due_at }
}

type DryRunItem = {
  /** Jour de l'échéance (ISO). */
  date: string
  position: number
  kind: OutreachStepKind
  names: string[]
}

/**
 * L'ESSAI À BLANC — ce que la campagne préparera, pour qui et quand, si rien ne change. Calculé sur les étapes
 * encore à faire des séquences vivantes ; rien n'est créé (ni tâche, ni message), rien ne part. Les échéances
 * passées se lisent « aujourd'hui » : une étape en retard arrive dans À traiter dès maintenant.
 */
export function dryRun(members: readonly OutreachSequence[], now: Date): DryRunItem[] {
  const groups = new Map<string, DryRunItem>()
  for (const member of members) {
    if (member.status !== 'active' || member.contact_replied) continue
    for (const step of member.steps) {
      if (step.status !== 'pending') continue
      const due = Math.max(new Date(step.due_at).getTime(), startOfDay(now))
      const day = new Date(due)
      day.setHours(0, 0, 0, 0)
      const key = `${day.toISOString()}|${step.position}|${step.kind}`
      const item = groups.get(key) ?? { date: day.toISOString(), position: step.position, kind: step.kind, names: [] }
      if (member.contact_name) item.names.push(member.contact_name)
      groups.set(key, item)
    }
  }
  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position)
}

/** Les membres dont une étape d'APPEL est à faire, avec cette étape — pour la carte « Appels de la séquence ». */
export function pendingCalls(
  members: readonly OutreachSequence[],
): { member: OutreachSequence; step: OutreachSequenceStep }[] {
  return members.flatMap(member => {
    if (member.status !== 'active' || member.contact_replied) return []
    const step = member.steps.find(candidate => candidate.status === 'pending')
    return step && step.kind === 'call' ? [{ member, step }] : []
  })
}

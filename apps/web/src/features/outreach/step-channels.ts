import { Bell, ListChecks, Linkedin, Mail, Phone, UserPlus, type LucideIcon } from 'lucide-react'
import {
  businessDaysBetween,
  linkedinGateFor,
  outreachOutcomesForKind,
  type OutreachDelayUnit,
  type OutreachSequence,
  type OutreachSequenceStep,
  type OutreachStepKind,
} from '@bellum/contracts'

/**
 * Lot L-B (#4165) — le vocabulaire VISUEL et gestuel des canaux d'une étape.
 * Tout ce qui se calcule (porte LinkedIn, jours ouvrés, issues) vient du
 * contrat : ici ne reste que ce que l'écran en fait.
 */

/** Une icône par nature d'étape — jamais un texte seul pour dire un canal. */
export const STEP_KIND_ICON: Record<OutreachStepKind, LucideIcon> = {
  email: Mail,
  reminder: Bell,
  task: ListChecks,
  linkedin_invite: UserPlus,
  linkedin_message: Linkedin,
  call: Phone,
}

const DAY_MS = 86_400_000

/**
 * Le délai d'une étape tel que l'éditeur l'affiche (« J+3 ouvrés »). Le délai
 * DEMANDÉ est gardé dans le payload à la création ; sans lui (étape datée à la
 * main, séquence ancienne), il se déduit de l'écart avec la création, dans
 * l'unité de la séquence.
 */
export function delayOf(
  step: OutreachSequenceStep,
  sequence: Pick<OutreachSequence, 'delay_unit' | 'created_at'>,
): { days: number; unit: OutreachDelayUnit } {
  const unit = sequence.delay_unit
  const kept = step.payload['offset_days']
  if (typeof kept === 'number' && Number.isFinite(kept) && kept >= 0) return { days: kept, unit }
  const from = new Date(sequence.created_at)
  const to = new Date(step.due_at)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return { days: 0, unit }
  const days =
    unit === 'business_days'
      ? businessDaysBetween(from, to)
      : Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY_MS))
  return { days, unit }
}

/** La porte LinkedIn d'une étape message — voir `linkedinGateFor` (contrat). */
export function gateOf(
  steps: readonly OutreachSequenceStep[],
  step: OutreachSequenceStep,
): 'accepted' | 'awaiting_acceptance' | null {
  return linkedinGateFor(steps, step)
}

/** Seules les URL http(s) s'ouvrent : un profil ne devient jamais `javascript:`. */
function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

/** Ce que prépare une étape LinkedIn : le texte déjà écrit (ou `null`) et le profil à ouvrir. */
export function linkedinDraftOf(step: OutreachSequenceStep): { body: string | null; profileUrl: string | null } {
  const draft = step.payload['linkedin_draft']
  const body =
    draft && typeof draft === 'object' && typeof (draft as { body?: unknown }).body === 'string'
      ? (draft as { body: string }).body.trim() || null
      : null
  const draftUrl = draft && typeof draft === 'object' ? safeUrl((draft as { profile_url?: unknown }).profile_url) : null
  return { body, profileUrl: draftUrl ?? safeUrl(step.payload['profile_url']) }
}

/** La trame d'appel préparée, ou `null` : jamais un script inventé. */
export function callScriptOf(step: OutreachSequenceStep): string | null {
  const script = step.payload['call_script']
  return typeof script === 'string' && script.trim().length > 0 ? script : null
}

/** Les issues que l'utilisateur peut déclarer sur cette nature d'étape. */
export function outcomeOptions(kind: OutreachStepKind): string[] {
  return [...outreachOutcomesForKind(kind)]
}

/** Les identifiants dans leur nouvel ordre après avoir déplacé `id` d'un cran ; `null` au bord. */
export function moveId(ids: readonly string[], id: string, direction: -1 | 1): string[] | null {
  const from = ids.indexOf(id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= ids.length) return null
  const next = [...ids]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved as string)
  return next
}

/** La pause vacances en cours : combien de séquences, et la reprise la plus LOINTAINE. `null` = aucune. */
export function vacationOf(sequences: readonly OutreachSequence[]): { count: number; until: string } | null {
  const paused = sequences.filter(
    (sequence): sequence is OutreachSequence & { vacation_until: string } =>
      sequence.status === 'paused' && sequence.vacation_until !== null,
  )
  if (paused.length === 0) return null
  const until = paused.reduce(
    (latest, sequence) => (sequence.vacation_until > latest ? sequence.vacation_until : latest),
    '',
  )
  return { count: paused.length, until }
}

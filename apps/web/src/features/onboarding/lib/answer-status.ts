import { UNKNOWN_ANSWER_LABELS, unknownAnswerReasonOf, type UnknownAnswerReason } from '@bellum/contracts'
import type { Question } from '@/features/onboarding/lib/questions'
import { presentedValue, validate } from '@/features/onboarding/lib/validation'

/**
 * Théo O onboarding-theme.N1 — les CINQ statuts d'une réponse : renseignée +
 * les quatre incertitudes que #2027 persiste déjà (`UNKNOWN_ANSWER_REASONS`).
 * Aucun statut n'est inventé : la V23 rend visible, pour CHAQUE question, ce
 * que le contrat sait déjà dire.
 */
export const ANSWER_STATUSES = [
  'answered',
  'not_yet_known',
  'answer_later',
  'to_verify_with_team',
  'not_applicable',
] as const

export type AnswerStatus = (typeof ANSWER_STATUSES)[number]

/** Un statut posé par l'utilisateur au-dessus d'« empty » : les quatre incertitudes. */
export type DeclaredStatus = UnknownAnswerReason

type StoredValue = string | string[] | null | undefined

/**
 * Seuls `text` et `single` portent l'incertitude DANS leur valeur (canal
 * existant, libellé verbatim — aucune colonne neuve). Un nombre ou une liste y
 * mettraient une chaîne dans une colonne qui n'en attend pas : leur statut
 * vit à côté (`statuses` du store d'onboarding).
 */
function carriesStatusInValue(question: Question): boolean {
  return question.kind === 'text' || question.kind === 'single'
}

/**
 * Le statut d'une question. Une vraie réponse gagne TOUJOURS sur un statut
 * local périmé (une correction humaine gagne, quelle que soit sa date).
 */
export function statusOf(
  question: Question,
  value: StoredValue,
  localStatus: DeclaredStatus | undefined,
): AnswerStatus | 'empty' {
  const shown = presentedValue(question, value)
  if (typeof shown === 'string') {
    const reason = unknownAnswerReasonOf(shown)
    if (reason) return reason
  }
  if (validate(question, shown)) return 'answered'
  return localStatus ?? 'empty'
}

/** La valeur à écrire quand l'utilisateur choisit un statut d'incertitude. */
export function valueForStatus(question: Question, status: DeclaredStatus): string | string[] {
  if (carriesStatusInValue(question)) return UNKNOWN_ANSWER_LABELS[status]
  return question.kind === 'number' ? '' : []
}

/** Faut-il aussi garder le statut dans le magasin local ? (valeur qui ne peut pas le porter) */
export function needsLocalStatus(question: Question): boolean {
  return !carriesStatusInValue(question)
}

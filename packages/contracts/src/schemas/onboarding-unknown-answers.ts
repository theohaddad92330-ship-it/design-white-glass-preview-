/**
 * #2027 — ONBOARDING — NE PAS FORCER UNE FAUSSE PRÉCISION.
 *
 * Quatre états d'incertitude, DISTINCTS d'une absence de réponse : une
 * question sans réponse est « pas encore répondue » (bloque « Continuer »
 * sauf si `optional`) ; une question répondue par l'un de ces quatre libellés
 * dit explicitement « je ne peux pas répondre, et voici pourquoi » — c'est une
 * réponse à part entière, pas un vide.
 *
 * Réutilise le canal de réponse EXISTANT (`Choice.value`, persistée verbatim,
 * même convention que toute question `single`) plutôt qu'une colonne neuve :
 * ces quatre chaînes ne sont JAMAIS un texte à afficher tel quel dans un
 * prompt IA ou un audit — `isUnknownAnswerValue` / `unknownAnswerReasonOf`
 * sont le SEUL endroit qui les reconnaît, et tout lecteur en aval (audit,
 * scoring, constructeur de prompt) doit les traiter comme `null` + une
 * raison NOMMÉE, jamais comme la valeur mesurée du champ.
 *
 * Preuve que ça ne casse rien en silence : un lecteur IA qui ne reconnaît pas
 * ces mots-clés retombe déjà sur « inconnu » par construction (ex.
 * `apps/ia/app/services/sales_context.py::_bench_band`, `return "inconnu"`
 * en absence de mot-clé reconnu) — ces quatre valeurs ne matchent aucun
 * mot-clé de bande existant, donc `_bench_band` les traite déjà comme
 * inconnues sans changement côté IA.
 */

export const UNKNOWN_ANSWER_REASONS = [
  'not_yet_known',
  'not_applicable',
  'to_verify_with_team',
  'answer_later',
] as const

export type UnknownAnswerReason = (typeof UNKNOWN_ANSWER_REASONS)[number]

/**
 * Les quatre libellés EXACTS de l'issue #2027, persistés verbatim — même
 * convention que `Choice.value` (`lib/questions/types.ts`).
 */
export const UNKNOWN_ANSWER_LABELS: Record<UnknownAnswerReason, string> = {
  not_yet_known: 'Je ne sais pas encore',
  not_applicable: 'Non applicable',
  to_verify_with_team: 'À vérifier avec mon équipe',
  answer_later: 'Je préfère répondre plus tard',
}

const VALUE_TO_REASON: ReadonlyMap<string, UnknownAnswerReason> = new Map(
  UNKNOWN_ANSWER_REASONS.map(reason => [UNKNOWN_ANSWER_LABELS[reason], reason]),
)

/** #2027.2 — distingue une réponse d'INCERTITUDE d'une réponse VIDE. */
export function isUnknownAnswerValue(value: string | null | undefined): boolean {
  return typeof value === 'string' && VALUE_TO_REASON.has(value)
}

/** La raison nommée derrière une valeur d'incertitude, ou `null` si la valeur
 *  est une réponse mesurée (ou une absence de réponse). */
export function unknownAnswerReasonOf(value: string | null | undefined): UnknownAnswerReason | null {
  if (typeof value !== 'string') return null
  return VALUE_TO_REASON.get(value) ?? null
}

/**
 * Théo O onboarding-couverture — les CINQ statuts d'une réponse de la V23 : « répondue » + les quatre incertitudes
 * ci-dessus (Je ne sais pas · À compléter plus tard · Non applicable · À vérifier avec mon équipe).
 *
 * Aucune colonne neuve ni valeur renommée : la valeur persistée d'une incertitude reste le libellé verbatim d'avant
 * (#2027), donc rien de ce qui a déjà été répondu ne se perd. Le statut se DÉRIVE de la valeur ({@link responseStatusOf}) ;
 * les libellés affichés (« Plus tard »…) vivent dans l'i18n, pas ici.
 */
export const RESPONSE_STATUSES_V23 = ['answered', ...UNKNOWN_ANSWER_REASONS] as const
export type ResponseStatusV23 = (typeof RESPONSE_STATUSES_V23)[number]

/** Le statut d'une réponse texte : `null` quand il n'y a PAS de réponse (une absence n'est pas un statut). */
export function responseStatusOf(value: string | null | undefined): ResponseStatusV23 | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  return unknownAnswerReasonOf(value) ?? 'answered'
}

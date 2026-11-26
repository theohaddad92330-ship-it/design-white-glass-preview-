import type { AuditActiveLoad } from '@bellum/contracts'

type MissingAnswers = Extract<AuditActiveLoad['reserve'], { kind: 'answerMissing' }>['missingAnswers']

/**
 * #2067.2 / .4 / .5 / .6 — les réponses qui manquent à une grandeur de
 * l'arbitrage, nommées en clair. UNE lecture, deux lecteurs : la carte de la
 * grandeur (`AuditActiveLoad`) et « Ce qui n'a pas pu être établi »
 * (`AuditUnestablished`) — la même absence ne s'écrit pas deux fois (GA-26).
 */
export function activeLoadMissingAnswers(
  missingAnswers: MissingAnswers,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  return missingAnswers.map(key => t(`activeLoad.answer.${key}`)).join(', ')
}

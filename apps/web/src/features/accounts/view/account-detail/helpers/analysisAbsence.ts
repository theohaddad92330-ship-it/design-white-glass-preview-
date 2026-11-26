import type { Account } from '@bellum/contracts'

/**
 * #2502.2 — POURQUOI une section DÉRIVÉE DE L'ANALYSE est vide, quatre
 * réponses jamais une seule. Née de `plan/planAbsence.ts` (#2123.12) et
 * GÉNÉRALISÉE ici : le tableau du plan n'est pas le seul écran à confondre
 * « cassé » et « non mesurable » — `EmptyEvaluationCard` (Synthèse ›
 * Évaluation) montrait la MÊME phrase générique (« Score à compléter »)
 * qu'une analyse tourne encore, ait échoué, n'ait jamais eu lieu, ou ait
 * réellement abouti sans rien à recommander. `plan/planAbsence.ts` réexporte
 * cette fonction (`PlanAbsence`/`planAbsence`) pour ne garder qu'UNE
 * implémentation (GA-26) sans toucher ses appelants existants.
 *
 * L'ordre des cas EST la règle, et il reste identique à `planAbsence` :
 * `analyzing` gagne sur tout, l'échec gagne sur l'absence de date, et un
 * compte `completed` sans date n'est JAMAIS lu comme « jamais analysé »
 * (le portail go/no-go peut clôturer un compte sans poser cette date).
 */
export type AccountAnalysisAbsence =
  /** L'analyse tourne — la section arrive, il n'y a rien à faire. */
  | 'analysis-running'
  /** La dernière analyse ne s'est pas terminée : échec ou annulation. */
  | 'analysis-incomplete'
  /** Ce dossier n'a jamais été analysé. */
  | 'not-analyzed'
  /** L'analyse a abouti — la section peut réellement n'avoir rien à montrer. */
  | 'analysis-complete'

/** Les champs du compte dont la réponse dépend — et rien d'autre, pour que la
 *  fonction reste testable sans fabriquer un `Account` entier. */
type AnalysisAbsenceInput = Pick<Account, 'status'> & Partial<Pick<Account, 'last_analyzed_at'>>

export function accountAnalysisAbsence({
  status,
  last_analyzed_at: lastAnalyzedAt,
}: AnalysisAbsenceInput): AccountAnalysisAbsence {
  if (status === 'analyzing') return 'analysis-running'
  if (status === 'error' || status === 'canceled') return 'analysis-incomplete'
  if (status === 'prospect' || (!lastAnalyzedAt && status !== 'completed')) return 'not-analyzed'
  return 'analysis-complete'
}

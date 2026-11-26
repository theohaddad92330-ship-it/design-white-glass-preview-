import { z } from 'zod'

/**
 * #4295.1 (#3666.3) — UN SEUL vocabulaire d'état pour le travail asynchrone (analyse, imports) :
 * en attente / en cours / terminée / partielle / interrompue — partagé par le web, l'API et ce que Laura lit.
 *
 * Il vivait dans `apps/web/src/lib/operation-status.ts` seul : l'API rendait à Laura l'état BRUT d'un import
 * universel (`failed`, plus un drapeau `interrupted` à part) quand l'écran disait « Interrompu ». Deux
 * vocabulaires pour le même fait divergent (GA-26) ; celui-ci est le seul.
 *
 * Pas de pourcentage : on dit l'état réel. Un état qu'on ne sait pas nommer vaut `null` — jamais un statut
 * deviné, jamais « terminée » par défaut (« On n'affiche pas ce qu'on n'a pas »). L'ordre ne change pas (GA-08).
 */
export const OPERATION_STATUSES = ['pending', 'running', 'completed', 'partial', 'interrupted'] as const
export const operationStatusSchema = z.enum(OPERATION_STATUSES)
export type OperationStatus = z.infer<typeof operationStatusSchema>

/** L'analyse d'un compte : terminée AVEC des sources dégradées est « partielle », une erreur « interrompue ». */
export function analysisOperationStatus(run: {
  state: string
  warnings: ReadonlyArray<unknown>
}): OperationStatus | null {
  switch (run.state) {
    case 'starting':
      return 'pending'
    case 'analyzing':
      return 'running'
    case 'completed':
      return run.warnings.length > 0 ? 'partial' : 'completed'
    case 'error':
      return 'interrupted'
    default:
      return null
  }
}

/** L'import CRM (`import_runs`) : `partial` = arrêté en route après avoir écrit des lignes. */
export function importOperationStatus(state: string): OperationStatus | null {
  switch (state) {
    case 'draft':
    case 'simulated':
      return 'pending'
    case 'applied':
      return 'completed'
    case 'partial':
      return 'partial'
    case 'failed':
      return 'interrupted'
    default:
      return null
  }
}

/**
 * #4295.1 — l'import universel (`universal_import_jobs`), lu comme l'écran /settings/import le dit déjà :
 *  · `uploading`/`queued` : rien n'est lu → en attente ; `processing` → en cours ;
 *  · `done` → terminée, MÊME avec des lignes écartées : l'historique dit « Terminé · N écartées » (#4051.10),
 *    une ligne refusée pour sa raison n'est pas un import inachevé ;
 *  · `failed`, ou l'envoi resté « en cours » au-delà du délai (`interrupted`, #4422.1) → interrompue.
 */
export function universalImportOperationStatus(job: { status: string; interrupted?: boolean }): OperationStatus | null {
  if (job.interrupted) return 'interrupted'
  switch (job.status) {
    case 'uploading':
    case 'queued':
      return 'pending'
    case 'processing':
      return 'running'
    case 'done':
      return 'completed'
    case 'failed':
      return 'interrupted'
    default:
      return null
  }
}

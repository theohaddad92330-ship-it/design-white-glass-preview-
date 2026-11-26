/**
 * Ce qu'un run d'analyse est DEVENU — la dérivation, à un seul endroit.
 *
 * Elle vivait dans `apps/api/src/modules/actions/actions.service.ts`, qui
 * l'utilise pour écrire « Sans suite » dans l'historique (changelog du
 * 20/07/2026 : « ni réussi, ni échoué : nous ne le savons pas, et nous ne le
 * prétendons pas »). L'alerte « no-outcome » de l'observabilité pose EXACTEMENT
 * la même question à la même table ; la recopier aurait garanti qu'un jour les
 * deux répondent différemment sur le même run — l'écran dirait « Sans suite » et
 * l'alerte compterait un run en cours.
 *
 * Un réglage — et une dérivation — vivent à un seul endroit (GA-26).
 */

/**
 * Au-delà de ce délai, un run encore marqué `analyzing` n'a plus d'événement
 * terminal à attendre : le processus qui nous en devait un est parti.
 *
 * ⚠️ Miroir de `JOB_TIMEOUT_MS` (20 min, le plafond dur du worker d'analyse).
 * S'en écarter vers le bas déclarerait « sans suite » un run encore vivant ;
 * vers le haut ferait passer un run mort pour un run qui travaille.
 */
export const RUN_ABANDONED_AFTER_MS = 1_200_000

/**
 * Les issues possibles d'un run, en liste fermée.
 *
 * `no_outcome` et `unknown` sont deux ignorances DIFFÉRENTES, et les confondre
 * ferait mentir les deux : `no_outcome` est un constat mesuré (le run avait le
 * temps de finir et n'a rien rendu) ; `unknown` est l'absence de constat (un
 * statut que ce code ne sait pas lire, par exemple une valeur ajoutée à la table
 * sans passer par ici).
 */
export type RunOutcomeVerdict = 'completed' | 'failed' | 'canceled' | 'running' | 'no_outcome' | 'unknown'

/** Ce qu'il faut savoir d'un run pour le classer : rien de plus. */
export type RunOutcomeInput = {
  /** Le statut tel que `analysis_runs.status` le porte. */
  status: string
  createdAt: Date
}

const TERMINAL: Readonly<Record<string, RunOutcomeVerdict>> = {
  completed: 'completed',
  error: 'failed',
  canceled: 'canceled',
}

/**
 * Ce que ce run est devenu, à l'instant `now`.
 *
 * Ne devine JAMAIS : un statut hors vocabulaire rend `unknown` plutôt que de
 * tomber dans la case la plus proche.
 */
export function classifyRunOutcome(run: RunOutcomeInput, now: Date): RunOutcomeVerdict {
  const terminal = TERMINAL[run.status]
  if (terminal) return terminal
  if (run.status !== 'analyzing') return 'unknown'
  const age = now.getTime() - run.createdAt.getTime()
  return age > RUN_ABANDONED_AFTER_MS ? 'no_outcome' : 'running'
}

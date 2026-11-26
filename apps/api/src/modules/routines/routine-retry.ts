/**
 * #2843.20 / #2843.9 (lot L13) — LA REPRISE d'une occurrence échouée, et sa
 * limite.
 *
 * Avant : une occurrence en échec gardait sa clé `utilisateur:routine:jour`,
 * donc plus rien ne la rejouait avant le lendemain — un 503 passager à 8 h
 * faisait sauter le brief de la journée. Maintenant : jusqu'à
 * {@link ROUTINE_MAX_ATTEMPTS} tentatives sur la MÊME occurrence, espacées par
 * un délai qui double (15 min, puis 30 min). La reprise réutilise la ligne
 * réservée (jamais une seconde ligne) : l'idempotence « je réserve puis
 * j'envoie » reste entière.
 *
 * Au bout du compte, l'abonnement passe en statut `error` (désactivé, dit à
 * l'écran) : une routine qui échoue trois fois de suite ne réessaie pas à
 * l'infini en silence. Elle ne repart que sur un geste de l'utilisateur.
 */
export const ROUTINE_MAX_ATTEMPTS = 3
const ROUTINE_RETRY_BASE_MINUTES = 15

/** La convention d'échec écrite par `RoutinesService` — lue ici, jamais redevinée ailleurs. */
export const ROUTINE_FAILURE_PREFIX = 'Échec : '

/**
 * #2843.19 — le statut NOMMÉ d'une occurrence arrêtée par le plafond de coût réglé au
 * back-office. Ni montant ni crédit (c132) : l'utilisateur lit qu'elle s'est arrêtée,
 * jamais combien. Ce n'est pas un échec : aucune reprise (#2843.20) ne la relance.
 */
export const ROUTINE_BUDGET_STOP_OUTCOME = 'Arrêtée : plafond d’usage atteint, elle reprendra quand il se libère.'

export function isFailedOutcome(outcome: string): boolean {
  return outcome.startsWith(ROUTINE_FAILURE_PREFIX)
}

/** Le délai avant la tentative suivante : 15 min après la 1re, 30 min après la 2e. */
export function routineRetryDelayMs(attempt: number): number {
  return ROUTINE_RETRY_BASE_MINUTES * 60_000 * 2 ** Math.max(0, attempt - 1)
}

/**
 * La dernière trace de l'occurrence COURANTE doit-elle être rejouée maintenant ?
 * Non si elle a réussi, si le compte de tentatives est atteint, ou si le délai
 * n'est pas écoulé. Une trace sans date de tentative (ligne antérieure à la
 * migration) retombe sur sa date de création.
 */
export function routineRetryDue(
  run: { outcome: string; attempt?: number | null; attempted_at?: Date | null; created_at: Date },
  now: Date,
): boolean {
  if (!isFailedOutcome(run.outcome)) return false
  const attempt = run.attempt ?? 1
  if (attempt >= ROUTINE_MAX_ATTEMPTS) return false
  const last = run.attempted_at ?? run.created_at
  return now.getTime() - last.getTime() >= routineRetryDelayMs(attempt)
}

/**
 * #3666.4 — ATTENTE ANORMALE. Une analyse tient 3 à 6 minutes ; sans aucun signe
 * de vie (événement streamé ou lecture serveur) au-delà de ce seuil, l'écran
 * d'attente propose « Continuer à consulter ». Même preuve de vie que
 * `isRunStale` (store), seuil plus court : le GC évince à 30 min, ici on ne fait
 * que laisser l'utilisateur quitter l'écran — la course n'est ni annulée ni
 * relancée.
 */
export const QUIET_RUN_MS = 10 * 60 * 1000

export function isRunQuiet(
  run: { events: ReadonlyArray<{ at: number }>; syncedAt?: number },
  now: number = Date.now(),
): boolean {
  const lastEventAt = run.events.length > 0 ? run.events[run.events.length - 1].at : 0
  const lastProofOfLife = Math.max(lastEventAt, run.syncedAt ?? 0)
  return lastProofOfLife > 0 && now - lastProofOfLife > QUIET_RUN_MS
}

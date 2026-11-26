import { isoDay } from './planning'

/**
 * #4197 (L6) — LES TROIS HORIZONS DE « FIN SOUS 30 / 60 / 90 J ».
 *
 * Même périmètre que les compteurs `missions_ending_30/60/90` du serveur
 * (#4193) : la date de fin tombe dans les N prochains jours, aujourd'hui
 * compris. Les fenêtres sont CUMULATIVES (une fin à 45 j est sous 60 j et sous
 * 90 j), à la différence du filtre « Fin » existant, dont les huit fenêtres sont
 * disjointes (`RenewalWindow`) — les deux coexistent, ils ne répondent pas à la
 * même question : « qu'est-ce qui finit bientôt ? » contre « où en est chaque
 * fenêtre de renouvellement ? ».
 */
export const ENDING_HORIZONS = [30, 60, 90] as const
export type EndingHorizon = (typeof ENDING_HORIZONS)[number]

/** `YYYY-MM-DD` ordonne comme les dates : on compare des jours, jamais des instants (fuseau). */
export function endsWithinDays(
  endsOn: string | null | undefined,
  days: EndingHorizon,
  today: Date = new Date(),
): boolean {
  if (!endsOn) return false
  const first = isoDay(today)
  const last = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days)
  const day = endsOn.slice(0, 10)
  return day >= first && day <= isoDay(last)
}

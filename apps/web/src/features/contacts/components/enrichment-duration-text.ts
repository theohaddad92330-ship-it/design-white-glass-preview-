import type { EnrichmentDurationEstimate } from '@/features/contacts/api'

type EnrichmentDurationAnnouncement =
  | { key: 'enrich.confirm.durationUnknown' }
  | { key: 'enrich.confirm.durationEstimated'; params: { seconds: number; sampleSize: number } }
  | { key: 'enrich.confirm.durationEstimatedUnderSecond'; params: { sampleSize: number } }
  | { key: 'enrich.confirm.durationEstimatedBulk'; params: { seconds: number; count: number } }
  | { key: 'enrich.confirm.durationEstimatedBulkUnderSecond'; params: { count: number } }

/**
 * #2120.57 / #2297.23 — ce qu'annonce `EnrichConfirmDialog`, à partir de la
 * médiane serveur (ou de son absence).
 *
 * Pas de médiane (`estimate` null — moins de 5 mesures, ou pas encore
 * chargée) ⇒ la ligne honnête d'avant : « Durée : non mesurée ». Non mesuré
 * n'est jamais 0 (GA-18/19), donc jamais de chiffre ici.
 *
 * Un LOT (`count` > 1) annonce un taux PAR CONTACT, jamais un total calculé :
 * le lecteur multiplie lui-même, l'écran ne prétend pas connaître le total
 * réel d'une cascade qui variera contact par contact.
 *
 * #2120.57 (b) — mesuré en production le 20/09 : `Math.round(medianMs / 1000)`
 * rendait `0` pour toute médiane sous 500 ms, et l'écran affichait « environ
 * 0 s » — exactement le zéro interdit que le paragraphe ci-dessus promet déjà
 * d'éviter côté NON MESURÉ, mais qu'il laissait passer côté MESURÉ. Une durée
 * RÉELLE sous la seconde reste réelle : elle bascule sur une clé dédiée
 * (« moins d'une seconde » / « less than a second »), jamais sur `seconds: 0`.
 */
export function enrichmentDurationAnnouncement(
  estimate: EnrichmentDurationEstimate,
  count: number | undefined,
): EnrichmentDurationAnnouncement {
  if (!estimate) return { key: 'enrich.confirm.durationUnknown' }

  const isBulk = count !== undefined && count > 1
  const seconds = Math.round(estimate.medianMs / 1000)

  // #2120.57 — une médiane sous 500 ms arrondirait à 0 (GA-18/19 : jamais de
  // « 0 » chiffré pour une durée réelle). `medianMs` est déjà >= 0 côté
  // serveur (`enrichment_duration_samples_duration_ms_check`).
  if (seconds === 0) {
    return isBulk
      ? { key: 'enrich.confirm.durationEstimatedBulkUnderSecond', params: { count: count! } }
      : { key: 'enrich.confirm.durationEstimatedUnderSecond', params: { sampleSize: estimate.sampleSize } }
  }

  if (isBulk) {
    return { key: 'enrich.confirm.durationEstimatedBulk', params: { seconds, count: count! } }
  }

  return { key: 'enrich.confirm.durationEstimated', params: { seconds, sampleSize: estimate.sampleSize } }
}

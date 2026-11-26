/**
 * #1960.10 — L'ÉTAT D'UN SIGNALEMENT, TEL QUE SON AUTEUR LE LIT.
 *
 * Décision de Louis du 13/09/2026 : une page qui liste les signalements de la
 * personne et leur état — reçu, en cours, corrigé — sans lien vers un outil
 * interne. Le quatrième état existe parce que le service de tickets DISTINGUE
 * une fermeture non résolue (non prévu, doublon) d'une correction : l'écrire
 * « corrigé » serait faux.
 *
 * ⚠️ « État indisponible » n'est PAS dans cette liste, et c'est délibéré : un
 * ticket qu'on n'a pas pu lire (service injoignable, intégration éteinte,
 * signalement sans référence) n'est dans AUCUN de ces états — il est non
 * mesuré. Il voyage en `null`, jamais sous un cinquième nom qui se comparerait
 * aux quatre autres.
 *
 * La traduction depuis le ticket vit à UN endroit : `reportStatusOf`, côté API
 * (`apps/api/src/modules/feedback/report-status.ts`).
 */
export const REPORT_STATUSES = ['received', 'in_progress', 'fixed', 'closed_unresolved'] as const

export type ReportStatus = (typeof REPORT_STATUSES)[number]

/** Garde de lecture : une valeur venue du réseau n'est un état que si elle en est un. */
export function isReportStatus(value: unknown): value is ReportStatus {
  return typeof value === 'string' && (REPORT_STATUSES as readonly string[]).includes(value)
}

/**
 * #1952 (épopée #2844, lot SRC5 28/09 soir) — LES TRAVAUX LONGS DEPUIS LE CHAT,
 * LEUR PATRON PARTAGÉ.
 *
 * Trois travaux (matching massif #1952.3, export en lot #1952.6, recherche
 * multi-sources #1952.7) rejoignent l'import de CV en lot (#2326.12) sur le
 * MÊME contrat BullMQ + Socket.IO que l'analyse : progression persistée,
 * reprise depuis le dernier point, jamais un rejeu depuis zéro.
 *
 * ⚠️ Le statut du JOB (queue/traite/termine/echoue) réutilise EXACTEMENT
 * `CV_BATCH_IMPORT_JOB_STATUSES` (GA-26 : une dérivation vit à un seul
 * endroit) plutôt que d'en copier une jumelle ici — ce fichier n'exporte que
 * ce qui EST nouveau : les issues PAR ÉLÉMENT, où `unknown` porte la règle
 * CLAUDE.md « un timeout n'est pas un échec » : une requête partie sans
 * réponse observée (coupure d'infrastructure) n'est PAS un échec de l'élément
 * — elle n'est jamais re-tentée une fois qu'elle a dépensé (aucune boucle
 * `attempts` au niveau ÉLÉMENT, contrairement au job lui-même).
 */

/** L'issue d'UN élément d'un lot — un besoin matché, une ligne exportée, une source interrogée. */
export type LongRunningJobItemStatus = 'done' | 'failed' | 'unknown'

/** #1952.3 — l'issue du matching d'UN besoin dans le lot. */
export type BulkMatchingItemResult =
  | { needId: string; status: 'done'; matchCount: number }
  | { needId: string; status: 'failed'; error: string }
  | { needId: string; status: 'unknown' }

/** #1952.6 — les natures d'export en lot couvertes. Ajouts EN FIN (GA-08). */
export const BULK_EXPORT_JOB_KINDS = ['consultants_csv'] as const
export type BulkExportJobKind = (typeof BULK_EXPORT_JOB_KINDS)[number]

/** #1952.6 — un plafond ÉCRIT, jamais un « tout » qui grossirait sans fin : le
 *  CSV voyage en base (`bulk_export_jobs.result_csv`), pas dans un objet de
 *  stockage — ce plafond garde la ligne dans une taille raisonnable. */
export const BULK_EXPORT_MAX_ROWS = 20_000

/** #1952.7 — l'issue d'UNE source interrogée dans une recherche multi-sources. */
export type MultiSourceSearchItemResult =
  | { source: string; status: 'done'; candidateCount: number }
  | { source: string; status: 'failed'; error: string }
  | { source: string; status: 'unknown' }

/**
 * #1952.5 — l'issue de la réécriture du CV d'UN consultant dans le lot.
 * `charged` distingue un succès qui a RÉELLEMENT débité 1 crédit `cv_rewrite`
 * d'un succès qui n'a rien débité (espace de démonstration) — jamais deviné.
 */
export type BulkCvRewriteItemResult =
  | { consultantId: string; status: 'done'; charged: boolean }
  | { consultantId: string; status: 'failed'; error: string }
  | { consultantId: string; status: 'unknown' }

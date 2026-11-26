/**
 * #3666.9 — Décision Louis 15/10/2026 : la limite d'import ANNONCÉE est de 1 Go,
 * pour une archive de CV comme pour un fichier CRM. UN seul endroit (GA-26) : le
 * web refuse au-delà AVANT tout envoi, avec un message clair ; l'API relit la
 * même borne pour refuser ce que le web n'aurait pas écarté.
 *
 * Prérequis tenu (incident du 05/10, ZIP de CV traité dans le process API) :
 * l'octet ne transite plus par l'API — envoi DIRECT vers le stockage par URL
 * signée, puis traitement en tâche de fond (BullMQ) morceau par morceau.
 */
export const IMPORT_FILE_MAX_BYTES = 1024 * 1024 * 1024

/** Le libellé de la limite, tel que l'écran l'annonce (FR/EN identiques). */
export const IMPORT_FILE_MAX_LABEL = '1 Go'

/** Ce fichier dépasse-t-il la limite annoncée ? Une taille illisible n'est jamais « dans la limite ». */
export function exceedsImportLimit(byteSize: number): boolean {
  return !Number.isFinite(byteSize) || byteSize > IMPORT_FILE_MAX_BYTES
}

import { z } from 'zod'

/**
 * #2326.7/.9 (épopée #2794) — import CSV/XLSX d'un TABLEAU DE DISPONIBILITÉS
 * de consultants, distinct de `consultant-csv-import.ts` (#2183.5, qui CRÉE
 * des fiches) : ce fichier ne crée JAMAIS de talent — il met à jour
 * `available_from`/`tjm` de fiches qui existent déjà, rapprochées par
 * e-mail puis par nom. Une ligne qui ne rapproche personne est LISTÉE,
 * jamais devinée en création.
 */

/** Une fiche existante rapprochée et mise à jour. */
export type AvailabilityImportUpdated = {
  status: 'updated'
  line: number
  consultantId: string
  matchedOn: 'email' | 'name'
  fields: Array<'available_from' | 'tjm'>
}

/** Une ligne dont l'identité n'a rapproché aucune fiche existante, ou plusieurs. */
export type AvailabilityImportUnmatched = {
  status: 'unmatched'
  line: number
  identity: string
  reason: 'not_found' | 'ambiguous_name'
}

/** La ligne elle-même n'apportait rien à écrire. */
export type AvailabilityImportSkipped = {
  status: 'skipped'
  line: number
  reason: 'no_identity' | 'no_data' | 'malformed'
}

export type AvailabilityImportOutcome =
  | AvailabilityImportUpdated
  | AvailabilityImportUnmatched
  | AvailabilityImportSkipped

/** Le compte par issue, même patron que `summariseConsultantCsvImport`. */
export function summariseAvailabilityImport(
  outcomes: readonly AvailabilityImportOutcome[],
): Record<AvailabilityImportOutcome['status'], number> {
  return outcomes.reduce((acc, outcome) => ({ ...acc, [outcome.status]: acc[outcome.status] + 1 }), {
    updated: 0,
    unmatched: 0,
    skipped: 0,
  })
}

export type AvailabilityImportReport = {
  total: number
  summary: Record<AvailabilityImportOutcome['status'], number>
  outcomes: AvailabilityImportOutcome[]
  mappedColumns: Record<string, string>
  ignoredColumns: string[]
  truncated: boolean
}

/** CSV en texte, ou XLSX en base64 — même borne que `importConsultantsCsvSchema`
 *  pour le CSV ; le XLSX (binaire, base64) a besoin de plus de place. */
export const importAvailabilitySchema = z
  .object({
    format: z.enum(['csv', 'xlsx']),
    content: z.string().min(1).max(4_000_000),
  })
  .strict()
export type ImportAvailabilityInput = z.infer<typeof importAvailabilitySchema>

import { z } from 'zod'

/**
 * #2183.5 — import CSV d'un lot de consultants, au-delà du dépôt de CV.
 *
 * Même famille que `cv-batch-import.ts` (ZIP/messagerie) : une SEULE route
 * d'ingestion par nature de fichier, jamais de fusion silencieuse, chaque
 * ligne rend son issue. La différence de fond : une ligne CSV n'a pas de
 * texte de CV à comparer (`experienceKeys`), donc la décision reste la même
 * que le dépôt INTERACTIF (`CvIntakeService.intake`) — une ressemblance,
 * quelle qu'elle soit, ARRÊTE la ligne plutôt que de trancher seule ; c'est
 * l'appelant humain qui revient dessus, fiche par fiche.
 */

/** Une fiche neuve, créée sans aucune ressemblance trouvée. */
export type ConsultantCsvImportCreated = { status: 'created'; line: number; consultantId: string }
/** Une ou plusieurs fiches ressemblent déjà — SAUTÉE, jamais fusionnée seule. */
export type ConsultantCsvImportDuplicate = { status: 'duplicate'; line: number; matched: string[] }
/** La ligne elle-même ne désignait personne, ou répétait une ligne déjà lue. */
export type ConsultantCsvImportSkipped = {
  status: 'skipped'
  line: number
  reason: 'no_identity' | 'no_name' | 'duplicate_in_file' | 'malformed'
}
/**
 * #3781.1 — la ligne désigne une personne EFFACÉE (RGPD art. 17) : l'empreinte
 * posée à l'effacement répond avant toute écriture, comme pour le dépôt de CV
 * et la création manuelle. Distinct d'un doublon : il n'existe aucune fiche à
 * montrer, seule une empreinte sans donnée personnelle.
 */
export type ConsultantCsvImportErased = { status: 'erased'; line: number }

export type ConsultantCsvImportOutcome =
  ConsultantCsvImportCreated | ConsultantCsvImportDuplicate | ConsultantCsvImportSkipped | ConsultantCsvImportErased

/** Le compte par issue, pour le rapport de fin — même forme que `summariseCvBatchImport`. */
export function summariseConsultantCsvImport(
  outcomes: readonly ConsultantCsvImportOutcome[],
): Record<ConsultantCsvImportOutcome['status'], number> {
  return outcomes.reduce((acc, outcome) => ({ ...acc, [outcome.status]: acc[outcome.status] + 1 }), {
    created: 0,
    duplicate: 0,
    skipped: 0,
    erased: 0,
  })
}

export type ConsultantCsvImportReport = {
  total: number
  summary: Record<ConsultantCsvImportOutcome['status'], number>
  outcomes: ConsultantCsvImportOutcome[]
  /** Les en-têtes reconnus, et ceux qu'on a laissés de côté — jamais devinés. */
  mappedColumns: Record<string, string>
  ignoredColumns: string[]
  truncated: boolean
}

/**
 * La borne de taille (1 Mo, même borne que `importContactsCsvSchema`) fait
 * qu'un fichier collé par erreur est refusé proprement plutôt que de saturer
 * une requête.
 */
export const importConsultantsCsvSchema = z
  .object({
    content: z.string().min(1).max(1_000_000),
  })
  .strict()
export type ImportConsultantsCsvInput = z.infer<typeof importConsultantsCsvSchema>

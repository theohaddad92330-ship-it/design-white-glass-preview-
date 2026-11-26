import { buildFieldCorrectionView, type FieldCorrectionView, type RecordFieldAudit } from '@bellum/contracts'

/**
 * #2318.6 — LAU-FINAL-059, CORRECTION UTILISATEUR : assemble la vue à sept
 * éléments pour CHAQUE ligne du journal (`RecordHistory`).
 *
 * `buildFieldCorrectionView` (packages/contracts) a besoin de la source
 * PRÉCÉDENTE pour nommer honnêtement la « source contestée » — ce fichier la
 * trouve : le journal est trié du plus récent au plus ancien
 * (`ProvenanceService.history`, `ORDER BY created_at DESC`), donc la source
 * contestée d'une ligne est celle de la PROCHAINE ligne plus ancienne portant
 * le MÊME champ.
 *
 * Pure — testable sans réseau ni horloge.
 */
export function recordHistoryCorrectionViews(entries: readonly RecordFieldAudit[]): FieldCorrectionView[] {
  return entries.map((entry, index) => {
    const previous = entries.slice(index + 1).find(candidate => candidate.field === entry.field)
    return buildFieldCorrectionView(entry, previous?.source ?? null)
  })
}

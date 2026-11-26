import { PROCUREMENT_SECTION_KEY } from '@/features/brief-blocks/BriefSections'
import { parseCommercialBrief } from '../brief/parseCommercialBrief'

/** #5106.4 — une ligne de la section achats du brief, lue telle quelle (rien n'est recalculé ni inventé). */
export type ProcurementRow = {
  element: string
  name: string
  whatItIs: string
  keepInMind: string
  reliability: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * #5106.4 — les lignes de la section `achats-avant-d-appeler` de `raw_analysis.commercial_brief`.
 * Brief absent, invalide ou section absente ⇒ `[]` (on n'affiche pas ce qu'on n'a pas, #5106.7).
 * Une ligne sans aucun texte ne fait pas de carte.
 */
export function procurementRowsOf(rawAnalysis: Record<string, unknown> | null | undefined): ProcurementRow[] {
  const section = parseCommercialBrief(rawAnalysis)?.sections.find(
    candidate => candidate.key === PROCUREMENT_SECTION_KEY,
  )
  return (section?.rows ?? [])
    .map(row => ({
      element: text(row['element']),
      name: text(row['nom']),
      whatItIs: text(row['ce_que_c_est']),
      keepInMind: text(row['ce_que_tu_dois_avoir_en_tete']),
      reliability: text(row['fiabilite']),
    }))
    .filter(row => row.element || row.name || row.whatItIs)
}

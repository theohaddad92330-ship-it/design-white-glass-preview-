import type { ConsultantSectorKnowledge } from '@bellum/contracts'
import { terms } from './consultant-matching'

type SectorRow = { id: string; full_name: string | null; sectors: string[] | null; archived_at: Date | null }

/**
 * #5017.2 — les consultants de l'espace dont un secteur SOURCÉ recoupe celui du compte.
 *
 * Même comparaison de termes que `scoreSector` (consultant-matching) : une seule définition de « même
 * secteur ». Secteur du compte vide ⇒ aucune ligne (jamais tout le vivier) ; consultant sans secteur ou
 * archivé ⇒ aucune ligne.
 */
export function consultantsKnowingSector(
  rows: readonly SectorRow[],
  accountSector: string,
): ConsultantSectorKnowledge[] {
  const wanted = terms(accountSector.trim())
  if (wanted.size === 0) return []
  const out: ConsultantSectorKnowledge[] = []
  for (const row of rows) {
    if (row.archived_at) continue
    const matched = (row.sectors ?? []).filter(known => [...terms(known)].some(term => wanted.has(term)))
    if (matched.length > 0) out.push({ id: row.id, full_name: row.full_name, matched_sectors: matched })
  }
  return out
}

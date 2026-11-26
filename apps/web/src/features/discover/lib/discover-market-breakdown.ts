import { compactSector } from '@bellum/utils'
import { SIZE_BANDS, type SizeBandCode } from './discover-size-bounds'
import type { DiscoverCandidate } from './discover-types'
import { sizeBandOf } from './discover-overview'

/**
 * « Répartition des comptes » (Théo decouvrir) : ce que la liste AFFICHE, rangé par secteur et par taille.
 *
 * Un segment représente des comptes affichables — jamais un score ni un potentiel de revenus. Un compte dont le
 * secteur ou l'effectif est inconnu ne fait AUCUNE part : il n'est ni rangé « Autres » ni compté dans une taille
 * (une absence ne fait pas une ligne), et le total des tailles peut donc rester sous le nombre de comptes.
 */

const MAX_SECTORS = 5

interface SectorShare {
  /** Le libellé court du secteur, ou `null` pour le segment « Autres secteurs ». */
  sector: string | null
  count: number
}

export interface MarketBreakdown {
  /** Les comptes dont le secteur est connu — le dénominateur de la barre. */
  sectored: number
  sectors: SectorShare[]
  sizes: { code: SizeBandCode; count: number }[]
}

export function marketBreakdown(candidates: readonly DiscoverCandidate[]): MarketBreakdown {
  const bySector = new Map<string, number>()
  for (const candidate of candidates) {
    const sector = compactSector(candidate.sector)
    if (sector) bySector.set(sector, (bySector.get(sector) ?? 0) + 1)
  }
  const ranked = [...bySector.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const head = ranked.slice(0, MAX_SECTORS)
  const restCount = ranked.slice(MAX_SECTORS).reduce((sum, [, count]) => sum + count, 0)
  const sectors: SectorShare[] = head.map(([sector, count]) => ({ sector, count }))
  if (restCount > 0) sectors.push({ sector: null, count: restCount })

  // #4493 — la tranche se lit sur le libellé publié (« 250 à 499 salariés ») comme sur un code : avant, seul le
  // code était reconnu et la ligne « Par taille » restait vide sur les vraies réponses.
  const sizes = [...SIZE_BANDS]
    .reverse()
    .map(band => ({
      code: band.code,
      count: candidates.filter(candidate => sizeBandOf(candidate.headcountRange) === band.code).length,
    }))
    .filter(size => size.count > 0)

  return { sectored: ranked.reduce((sum, [, count]) => sum + count, 0), sectors, sizes }
}

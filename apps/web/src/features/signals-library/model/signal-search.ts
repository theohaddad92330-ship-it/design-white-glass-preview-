import { parseSignalDate, signalSortMs, scoreSearch, type ParsedSearch, type SearchFields } from '@bellum/contracts'
import type { WatchlistItem } from '@/features/watchlist/model/watchlist'

/**
 * Lot 768 — LA recherche de /signals. Lot 785 (#5213) : le noyau (normalisation, variantes, score) vit dans
 * `@bellum/contracts` — le SERVEUR de l'Historique pagine et cherche avec la MÊME règle (GA-26), l'écran ne la
 * redéfinit pas. Reste ici ce qui lit un `WatchlistItem`.
 */
export {
  highlightParts,
  normalizeSearchText,
  parseSearch,
  scoreSearch,
  techTermsIn,
  VARIANT_GROUPS,
  type ParsedSearch,
  type SearchFields,
} from '@bellum/contracts'

/** Les champs cherchés d'un besoin (Actuel comme Historique : la même lecture, GA-26). */
export function searchFieldsOf(item: WatchlistItem): SearchFields {
  const attachment = item.offerAttachment?.status === 'attached' ? item.offerAttachment : null
  return {
    title: [item.displayLabel, item.signalLabel].filter(Boolean).join(' '),
    skills: attachment ? [...attachment.skills, attachment.job_family ?? ''].filter(Boolean) : [],
    // Lot 772 — les titres des lignes regroupées (même besoin lu ailleurs) se cherchent aussi.
    detail: [item.salesImplication, attachment?.extract, ...(item.signalLine?.merged ?? []).map(row => row.title)]
      .filter(Boolean)
      .join(' '),
    account: item.companyName,
    dateMs: signalSortMs(parseSignalDate(item.signalDate)),
  }
}

export function scoreItem(
  search: ParsedSearch,
  item: WatchlistItem,
  nowMs: number = Date.now(),
): ReturnType<typeof scoreSearch> {
  return scoreSearch(search, searchFieldsOf(item), nowMs)
}

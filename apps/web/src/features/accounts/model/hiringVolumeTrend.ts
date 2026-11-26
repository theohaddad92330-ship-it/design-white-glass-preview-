import { isFutureSignalDate, isInternshipPosting, parseSignalDate } from '@bellum/contracts'

export type HiringVolumeMonth = { month: string; count: number }

/**
 * #3920 (décision Louis 15/10/2026) — la « tendance » d'un compte est le VOLUME d'OFFRES D'EMPLOI dans le
 * temps : les offres collectées (`raw_analysis.it_job_signals`), comptées par mois de publication.
 *
 * Jamais inventée : une offre sans date au jour ou au mois n'entre pas, un mois sans offre collectée ne fait
 * aucune ligne (pas de zéro de remplissage), les stages (jamais servis, #4044) et les dates futures sont écartés,
 * une offre vue deux fois compte une fois. Moins de deux mois datés = pas une tendance = `[]` (l'écran n'affiche
 * alors aucune ligne).
 */
export function hiringVolumeByMonth(offers: unknown): HiringVolumeMonth[] {
  if (!Array.isArray(offers)) return []
  const seen = new Set<string>()
  const counts = new Map<string, number>()
  for (const raw of offers) {
    if (!raw || typeof raw !== 'object') continue
    const offer = raw as Record<string, unknown>
    const date = typeof offer['date'] === 'string' ? offer['date'] : null
    if (isInternshipPosting(offer['title'], offer['contract_type'])) continue
    if (isFutureSignalDate(date)) continue
    const parsed = parseSignalDate(date)
    if (parsed.kind !== 'day' && parsed.kind !== 'month') continue
    const identity = `${String(offer['url'] ?? '')}|${String(offer['title'] ?? '')}|${String(offer['company'] ?? '')}|${date}`
    if (seen.has(identity)) continue
    seen.add(identity)
    const month = `${parsed.year}-${String(parsed.month).padStart(2, '0')}`
    counts.set(month, (counts.get(month) ?? 0) + 1)
  }
  if (counts.size < 2) return []
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }))
}

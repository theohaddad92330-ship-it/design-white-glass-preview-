import { accountDomainsFrom, homonymFactLens, type AnalysisResearchData } from '@bellum/contracts'

function textOf(record: Record<string, unknown>, keys: readonly string[]): string {
  return keys
    .map(key => record[key])
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
}

/**
 * LUDOVIC-D LC.2 — À LA COLLECTE : un signal ou un angle d'un HOMONYME (« Still Waters Farm » sur
 * STILL) n'entre pas au dossier. La décision est celle de `homonymFactLens` (`@bellum/contracts`),
 * la même que la veille et le plan lisent pour l'existant. Sans site du compte : rien n'est écarté.
 */
export function withoutHomonymResearchFacts(data: AnalysisResearchData): {
  data: AnalysisResearchData
  dropped: number
} {
  const domains = accountDomainsFrom(data.website)
  const signals = Array.isArray(data.recentSignals) ? data.recentSignals : []
  const angles = Array.isArray(data.angles) ? data.angles : []
  const signalFacts = signals.map(signal => {
    const record = signal as unknown as Record<string, unknown>
    const url = record['url']
    return { text: textOf(record, ['signal', 'title', 'description']), url: typeof url === 'string' ? url : null }
  })
  const lens = homonymFactLens(domains, signalFacts)
  const keptSignals = signals.filter((_, index) => lens.reasonFor(signalFacts[index] ?? { text: '' }) === null)
  const keptAngles = angles.filter(
    angle =>
      lens.reasonFor({
        text: textOf(angle as unknown as Record<string, unknown>, ['title', 'description', 'strategy']),
      }) === null,
  )
  const dropped = signals.length - keptSignals.length + (angles.length - keptAngles.length)
  if (dropped === 0) return { data, dropped }
  return { data: { ...data, recentSignals: keptSignals, angles: keptAngles }, dropped }
}

import type { AccountAnalysis } from '@bellum/contracts'

export type SignalCoverage = NonNullable<AccountAnalysis['signal_coverage']>

// #3817.2 — clé technique de source → FAMILLE de source, à UN seul endroit
// (GA-26) : cette table vivait dupliquée entre `BuyingSignals.tsx` et la
// carte principale. Jamais un nom de fournisseur affiché.
export const SIGNAL_SOURCE_FAMILY_KEY: Record<string, string> = {
  brave_news: 'press',
  france_travail: 'jobs',
  apec: 'jobs',
  welcome_to_the_jungle: 'jobs',
  ats_boards: 'jobs',
  bodacc: 'legal',
  boamp: 'tenders',
  decp: 'tenders',
}

/** #3817.2 — familles de sources injoignables, dédupliquées, jamais un fournisseur nommé. */
export function unreachableSignalFamilies(coverage: SignalCoverage | undefined, t: (key: string) => string): string[] {
  return [
    ...new Set(
      (coverage?.unreachable ?? []).map(entry =>
        t(`whyNow.sourceFamily.${SIGNAL_SOURCE_FAMILY_KEY[entry.source] ?? 'other'}`),
      ),
    ),
  ]
}

/**
 * #3817.2 — zéro signal n'est jamais « marché vide » (doctrine) : une source
 * injoignable se nomme (« Recherche incomplète : … »), une recherche aboutie
 * sans résultat le dit autrement (« … sources consultées »).
 */
export function signalsEmptyLabel(
  coverage: SignalCoverage | undefined,
  unreachableFamilies: string[],
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  return coverage?.status === 'incomplete' && unreachableFamilies.length > 0
    ? t('whyNow.signalsIncomplete', { sources: unreachableFamilies.join(', ') })
    : t('whyNow.signalsEmpty')
}

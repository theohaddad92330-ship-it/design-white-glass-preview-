/**
 * Lot 775 — la VUE d'un parcours observé et la porte de lecture que le contrôleur de `accounts` passe au lecteur de
 * lignes : un fichier sans service, pour que `accounts/` ne dépende pas du service de la mémoire marché (GA-07).
 */
export interface MarketPersonPathView {
  readonly id: string
  readonly jobTitle: string | null
  readonly roleFamily: string | null
  readonly skills: readonly string[]
  readonly startDate: string | null
  readonly endDate: string | null
  readonly datePrecision: 'day' | 'month' | 'year' | null
  /** Poste tenu aujourd'hui (pack v2.1) ; `null` = non dit — jamais déduit d'une date. */
  readonly isCurrent: boolean | null
  readonly workStatus: 'freelance' | 'esn' | 'salarie' | 'inconnu'
  readonly esnName: string | null
  readonly dailyRateEur: number | null
  readonly missionCity: string | null
  readonly missionRegion: string | null
}

export type MarketPersonPathsRead =
  | { readonly status: 'ok'; readonly paths: ReadonlyMap<string, readonly MarketPersonPathView[]> }
  | { readonly status: 'unavailable'; readonly reason: string }

/** La lecture des parcours par compte, déjà liée à l'espace par l'appelant (le contrôleur). */
export type MarketPersonPathsReader = (
  lookups: ReadonlyArray<{
    ref: string
    name: string
    website?: string | null
    /** Lot 793 — les identifiants communs (BM-A) du compte, résolus par `common_account_links`. */
    commonKeys?: readonly string[]
  }>,
) => Promise<MarketPersonPathsRead>

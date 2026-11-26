import type { OutreachEligibilityResponse } from '@bellum/contracts'

/** Lot L-B (#4165) — la lecture des exclusions à l'inscription (pur, hors composant). */

type EligibilityRow = OutreachEligibilityResponse['contacts'][number]

/** Les contacts qui portent au moins une exclusion, avec le détail. */
export function excludedRows(eligibility: OutreachEligibilityResponse | undefined): EligibilityRow[] {
  return (eligibility?.contacts ?? []).filter(row => row.exclusions.length > 0)
}

/** Un contact portant une exclusion NON forçable (opposition RGPD) n'est jamais inscrit. */
export function isHardBlocked(row: EligibilityRow): boolean {
  return row.exclusions.some(exclusion => !exclusion.forceable)
}

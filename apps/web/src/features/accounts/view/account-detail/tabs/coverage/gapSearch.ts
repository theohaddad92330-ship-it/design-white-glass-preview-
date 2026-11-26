import type { CoverageGap } from '@bellum/contracts'

/**
 * Turn a zone blanche into a query the account's contacts search can actually
 * match. The backend's `suggested_titles` is a rep-facing "DSI / CIO" string;
 * `filterContacts` does a plain substring match on `contact.title`, so we keep
 * only the FIRST (most discriminating) title. Falls back to the family label so
 * the CTA is never a no-op.
 */
export function gapSearchQuery(gap: CoverageGap): string {
  const fromTitles = gap.suggested_titles.split('/')[0]?.trim()
  if (fromTitles) return fromTitles
  return gap.family_label.split('/')[0]?.trim() || gap.family_label
}

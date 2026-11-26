import type { FirstAnalysisSuggestion } from '@bellum/contracts'

/**
 * Stable, URL-safe origin id for a first-analysis suggestion (Théo P0 §5).
 *
 * The Profiler suggestions carry no server id (schema = companyName/sector/
 * reason), so we derive a deterministic slug from company + sector. It travels
 * in the URL (`?suggestionId`) then into the `/analysis/start` body
 * (`suggestion_id`) PURELY to trace which suggestion launched a run — it never
 * re-resolves the company nor locks the editable draft. Two suggestions with
 * the same company but a different sector still get distinct ids (they are keyed
 * that way in the grid too).
 */
export function firstAnalysisSuggestionId(suggestion: FirstAnalysisSuggestion): string {
  const id = `${slug(suggestion.companyName)}--${slug(suggestion.sector)}`.replace(/^-+|-+$/g, '')
  return id || 'suggestion'
}

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

import type { Account } from '@bellum/contracts'
import { readEntityResolution } from '@bellum/contracts'

/**
 * Kineis / FNAC (recette prod 31/10) — l'aperçu a quelque chose à montrer que le brief ne dit pas : la résolution
 * d'entité est AMBIGUË, ou le compte est la filiale d'un seul détenteur (« Filiale de X », `EntityResolutionCard`).
 * Même lecture que `TabOverview` (`readEntityResolution`) — un seul endroit (GA-26).
 */
export function overviewHasEntityNotice(rawAnalysis: Account['raw_analysis']): boolean {
  const resolution = readEntityResolution(rawAnalysis)
  if (!resolution) return false
  return resolution.state === 'ambiguous' || (resolution.kind === 'subsidiary' && resolution.parent_names.length === 1)
}

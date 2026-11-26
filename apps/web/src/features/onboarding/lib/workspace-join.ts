import type { WorkspaceJoinCandidate, WorkspaceJoinOverview } from '@bellum/contracts'

/**
 * #2016 — les espaces détectés à MONTRER : un espace écarté (« ce n'est pas mon
 * entreprise ») ne revient pas. Lu par l'encart et par la page 0, qui décide
 * d'après lui si le CTA d'un compte neuf se tait.
 */
export function visibleJoinCandidates(overview: WorkspaceJoinOverview | undefined): WorkspaceJoinCandidate[] {
  return (overview?.candidates ?? []).filter(candidate => candidate.request?.status !== 'dismissed')
}

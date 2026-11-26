import type { AnalysisScopeSelection } from '@bellum/contracts'

export type ScopeKind = 'group' | 'entity' | 'site'

/** Ce que le cadrage dit déjà : un site si la zone est une ville, une entité si des entités sont ciblées. */
export function scopeKindOf(selection: AnalysisScopeSelection): ScopeKind {
  if (selection.geo_perimeter === 'city') return 'site'
  return (selection.included_entities ?? []).length > 0 ? 'entity' : 'group'
}

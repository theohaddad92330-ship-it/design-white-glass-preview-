import type { CompetitiveStrategy } from '@bellum/contracts'
import { CompetitivePositioningCard } from './CompetitivePositioningCard'

/**
 * #4323.3 — les ESN présentes vivent dans UNE seule liste sous « Ce que je sais », avec OU sans brief (`PresentEsnList`) :
 * « ESN déjà en place » ne se redit plus ici (Eviden ne figure plus dans deux cartes). Seul « Positionnement » reste
 * (notre angle, pas la présence), entier.
 */
export function EsnAndPositioning({ strategy }: { strategy: CompetitiveStrategy | undefined }) {
  const hasStrategy = Boolean(strategy && (strategy.positioning_statement || strategy.vs_competitors?.length))
  return strategy && hasStrategy ? <CompetitivePositioningCard strategy={strategy} /> : null
}

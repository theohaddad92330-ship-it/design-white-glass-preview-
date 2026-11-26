import type { CommercialBrief } from '@bellum/contracts'
import { deaccentLower } from '@bellum/contracts'

/**
 * #4322.1 (recette PROD 22/10) — « 65 CHEMINS DE MARCHÉ OBSERVÉS / Profils liés au compte identifiés sur le marché » ne
 * disait pas ce que la tuile mesure. Ce sont des PARCOURS de consultants passés par le compte, lus dans les données de
 * marché — pas des chemins d'accès, pas des contacts. Le texte de la tuile est écrit par le modèle du brief (déjà
 * stocké pour les comptes analysés) : on le réécrit à l'affichage, la valeur n'est jamais touchée.
 */
const MARKET_PATHS_LABEL = /^chemins?\b.*\bmarche\b/

export function plainMarketPathsKpi(
  kpis: CommercialBrief['kpis'],
  words: { label: string; caption: string },
): CommercialBrief['kpis'] {
  return kpis.map(kpi =>
    MARKET_PATHS_LABEL.test(deaccentLower(kpi.label)) ? { ...kpi, label: words.label, caption: words.caption } : kpi,
  )
}

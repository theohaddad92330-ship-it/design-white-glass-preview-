import { PortfolioCoverageCard } from '@/features/dashboard/components/perspective/PortfolioCoverageCard'
import { usePersonalCockpit } from '@/features/dashboard/hooks/usePersonalCockpit'

/**
 * #2114.60 / .64 — la COUVERTURE du portefeuille (« Voir les comptes concernés », « Préparer une revue »), montée
 * dans Pilotage › Cockpit. `PortfolioCoverageCard` ne vivait que dans `PersonalCockpit`, sous `/dashboard` — une
 * route morte (→ /briefing). Le verdict de trajectoire (`TrajectoryVerdict`) est monté en tête par `CockpitBody`.
 *
 * Même source que l'ancien écran (`/dashboard/me`, `perspective.coverage`) : une API plus ancienne, ou une lecture
 * échouée, ne porte pas la couverture ⇒ RIEN (jamais une couverture habillée en zéros).
 */
export function CockpitCoverage() {
  const { data, error } = usePersonalCockpit()
  const coverage = data.perspective?.coverage
  if (error || !coverage) return null
  return <PortfolioCoverageCard coverage={coverage} />
}

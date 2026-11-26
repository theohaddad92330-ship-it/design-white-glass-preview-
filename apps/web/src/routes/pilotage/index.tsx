import { createFileRoute } from '@tanstack/react-router'
import { PilotagePage } from '@/features/pilotage/view/PilotagePage'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { useRefreshEntitlementsOnLock } from '@/features/plan-features/useRefreshEntitlementsOnLock'
import { PilotagePendingSkeleton } from '@/features/pilotage/view/PilotagePendingSkeleton'

export const Route = createFileRoute('/pilotage/')({
  // Tableau de bord + Cockpit = un écran, deux lectures : `?vue=moi|equipe` (défaut : équipe).
  // Optionnelle — un lien vers `/pilotage` n'a pas à la fournir — et une valeur trafiquée
  // retombe sur le défaut plutôt que de casser la route.
  validateSearch: (search: Record<string, unknown>): { vue?: 'moi' | 'equipe' } =>
    search.vue === 'moi' || search.vue === 'equipe' ? { vue: search.vue } : {},
  component: GatedPage,
  // #3475 — squelette de page immédiat (coque + cartes) pendant que le chunk
  // de cet écran (le plus lourd de la nav, une douzaine de panneaux) charge,
  // au lieu du spinner générique sur fond sombre. Voir PilotagePendingSkeleton.
  pendingComponent: PilotagePendingSkeleton,
  // Le routeur ne rend `pendingComponent` qu'après `pendingMs` (1000 ms par
  // défaut) : jusque-là, chargement direct = écran noir (recette 01/10, #3475).
  // 0 = tout de suite ; `pendingMinMs` évite un clignotement si le chunk est en cache.
  pendingMs: 0,
  pendingMinMs: 300,
})

/**
 * La page Pilotage s'ouvre à tous : le droit se règle par SECTION dans la page (`PilotagePage`) —
 * Cockpit, Staffing, Finance pour les gestionnaires ; Pipe et Parcours pour tous, chacun son pipe.
 *
 * Louis 23/10 — LA PORTE DE L'OFFRE `manager_cockpit` EST SUR LA ROUTE. Le Cockpit de Théo la tenait par
 * `ManagerTabRoute` + `PlanFeatureRoute`, et plantait au chargement direct une fois `ManagerTabRoute` supprimé.
 * Elle est lue ICI (avec le rafraîchissement des droits de `PlanFeatureRoute` quand elle est fermée) et passée à
 * la page : sans l'offre, la porte de l'offre remplace les sections d'équipe — jamais la page entière, puisque
 * Pipe et Parcours restent ouverts (droits par sous-onglet, Louis 15/10).
 */
function GatedPage() {
  const { allowed } = usePlanFeature('manager_cockpit')
  useRefreshEntitlementsOnLock(!allowed)
  return <PilotagePage offerAllowed={allowed} />
}

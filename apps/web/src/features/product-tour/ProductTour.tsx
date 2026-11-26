import { useProductTourStore } from './product-tour-store'
import { ProductTourCompanion } from './ProductTourCompanion'
import { ProductTourDialog } from './ProductTourDialog'

/**
 * #1863.3 — LA VISITE, MONTÉE UNE FOIS, AU-DESSUS DES ROUTES.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI À LA RACINE, ET PAS DANS LE MENU QUI LA LANCE
 * ─────────────────────────────────────────────────────────────────────────
 * Avant ce lot, la visite était montée DANS `ChangelogMenu`, c'est-à-dire dans
 * le pied de la barre latérale. Deux conséquences, et c'est tout le défaut du
 * retour :
 *
 *  1. La barre latérale n'existe pas dans la coque MOBILE — la visite y était
 *     donc structurellement inatteignable.
 *  2. Surtout, la visite ne pouvait pas survivre à la navigation : elle vivait
 *     sous la chrome, et le seul geste qu'elle offrait (« Ouvrir cet écran »)
 *     la fermait. On ne peut pas être « emmené sur chacune des pages sans
 *     perdre le fil » depuis un composant qui doit se taire pour qu'on voie la
 *     page.
 *
 * Montée ici, à côté de `LauraDock` et `FeedbackWidget` — les deux autres
 * surfaces qui doivent être atteignables depuis N'IMPORTE quel écran — la
 * visite traverse les changements de route sans se démonter. Le menu
 * « Nouveautés » ne fait plus que l'ALLUMER.
 *
 * ⚠️ Elle ne rend rien tant que personne ne l'a demandée : c'est le cas de
 * loin le plus fréquent, et rien ne doit surgir de soi-même (l'arbitrage de
 * #1794.2 — un tutoriel qui se relance à chaque entrée de changelog serait
 * insupportable en trois jours).
 */
export function ProductTour() {
  const phase = useProductTourStore(state => state.phase)

  if (phase === 'reading') return <ProductTourDialog />
  if (phase === 'visiting') return <ProductTourCompanion />
  return null
}

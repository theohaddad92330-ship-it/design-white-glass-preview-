import { createFileRoute } from '@tanstack/react-router'
import { MarketWatchPage } from '@/features/market-watch/view/MarketWatch'

/**
 * `/accounts/marches` — la veille territoriale, onglet de Comptes (Louis
 * 14/10/2026, refonte Pilotage : Marché est de la prospection, pas du
 * pilotage). `/pilotage/marche` redirige ici.
 *
 * Pas de garde d'offre : la veille territoriale ne lit que de la donnée
 * publique — un commercial suit sa ville quel que soit le palier de son ESN.
 * La fiche d'UNE zone vit dans `marches_.$zoneId.tsx` (tiret bas final, GA-288).
 */
export const Route = createFileRoute('/accounts/marches')({
  component: MarketWatchPage,
})

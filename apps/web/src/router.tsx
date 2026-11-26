import { resolveProductScreen } from '@bellum/contracts'
import { createRouter } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { NotFound } from './components/organisms/not-found'
import { RootErrorBoundary } from './components/templates/error-boundary'
import { replaceLegacyAddressInBrowser, rewriteLegacyAddress } from './lib/legacy-addresses'
import { notifyRouteViewed } from './lib/product-tracker'
import { rememberReturnToApp } from './lib/return-to-app'
import { routeTree } from './routeTree.gen'

replaceLegacyAddressInBrowser()

export const router = createRouter({
  routeTree,
  // #2128.55 — un clic « précédent » du navigateur doit restaurer une
  // position de scroll proche de celle quittée. Sans ce réglage, le
  // navigateur restaure le scroll lui-même, souvent avant que le contenu
  // attendu ait fini de rendre — la position réelle quittée ne revient
  // jamais. TanStack Router mémorise la position par entrée d'historique et
  // la restaure après le rendu de la route de destination.
  scrollRestoration: true,
  // #4359 — la table des anciennes adresses encore portées par un message parti.
  rewrite: { input: rewriteLegacyAddress },
  defaultPendingComponent: () => (
    <div className="flex min-h-full items-center justify-center" style={{ background: 'var(--bg-base)' }}>
      <Loader2 className="h-6 w-6 animate-spin text-[var(--bellum-text-accent)]" />
    </div>
  ),
  defaultNotFoundComponent: () => <NotFound />,
  defaultErrorComponent: RootErrorBoundary,
  defaultPreload: 'intent',
})

/**
 * #1682 — le point d'entrée `screen_viewed`/`screen_left`. Route SEULE
 * (`pathname`, sans les paramètres de recherche : un filtre appliqué ne doit
 * pas voyager dans l'URL captée ici). La provenance est la route PRÉCÉDENTE en
 * navigation interne, ou le `referrer` du navigateur pour la toute première
 * vue de l'onglet — jamais une chaîne de requête.
 *
 * No-op strict si `VITE_PRODUCT_TRACKER_ENABLED` est absente : ce fichier
 * appelle `notifyRouteViewed()` inconditionnellement, c'est `product-tracker`
 * lui-même qui referme la porte en un seul endroit.
 */
/**
 * #1681 / #1683 — le chemin est replié vers son MOTIF **avant de partir**, pas
 * à la lecture.
 *
 * `event.toLocation.pathname` est un chemin RÉEL : `/accounts/3f1c…` porte
 * l'identifiant d'un compte CLIENT. Le laisser voyager coûtait deux fois —
 * chaque compte devenait « son » écran, donc tous sous le seuil des cinq
 * sessions, donc des tableaux vides ; et un identifiant de compte client
 * atterrissait dans une lecture d'OPÉRATEUR, ce que la règle 5 de l'analytique
 * produit interdit (« rien de comportemental par espace client nommé »).
 *
 * Le replier ici plutôt qu'à la lecture, c'est **retirer le MOYEN, pas la
 * permission** : l'identifiant n'entre jamais en base. Le moment est le bon —
 * `VITE_PRODUCT_TRACKER_ENABLED` est absente par défaut, donc aucune ligne
 * n'existe encore : on supprime la fuite au lieu de la filtrer.
 *
 * `resolveProductScreen` vit dans `@bellum/contracts` et sert AUSSI à la
 * lecture : une seule dérivation, jamais deux qui divergent (GA-26). Une route
 * hors catalogue rend `null` — jamais l'écran le plus ressemblant — et se dit
 * telle quelle, sans rien emporter.
 */
const UNKNOWN_SCREEN = '(hors catalogue)'
const screenPattern = (pathname: string): string => resolveProductScreen(pathname)?.route ?? UNKNOWN_SCREEN

router.subscribe('onResolved', event => {
  const provenance = event.fromLocation
    ? screenPattern(event.fromLocation.pathname)
    : typeof document !== 'undefined'
      ? document.referrer || null
      : null
  notifyRouteViewed(screenPattern(event.toLocation.pathname), provenance)

  // #2112.23-25 — retient la page d'origine en entrant dans les Réglages, pour
  // que « Retour à l'app » (`SettingsNavbarBody`) y ramène au lieu de renvoyer
  // systématiquement au Tableau de bord.
  rememberReturnToApp(event.fromLocation ?? null, event.toLocation.pathname)
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

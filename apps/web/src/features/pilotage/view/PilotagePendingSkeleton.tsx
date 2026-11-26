import { CustomerPage } from '@/components/page/CustomerPage'
import { DashboardSkeleton } from '@/features/dashboard/components/DashboardSkeleton'

/**
 * #3475 — `pendingComponent` de `/pilotage` : ce que le routeur montre PENDANT
 * que le chunk de `PilotagePage` (chargé à la demande, `autoCodeSplitting`)
 * télécharge.
 *
 * Reste dans le bundle CRITIQUE — `pendingComponent` n'est PAS dans
 * `defaultCodeSplitGroupings` (`@tanstack/router-plugin`, qui ne scinde que
 * `component`/`errorComponent`/`notFoundComponent`) — donc disponible
 * immédiatement, contrairement au spinner générique du routeur
 * (`router.tsx`, `defaultPendingComponent`) qui laissait ~2,5 s d'écran
 * presque noir (fond sombre, un spinner minuscule, rien d'autre) avant que la
 * vraie page n'apparaisse.
 *
 * La vraie coque (barre latérale, en-tête) s'affiche tout de suite — `
 * CustomerPage` ne dépend d'aucune donnée propre à Pilotage, seulement de la
 * session déjà résolue à ce stade (le routeur ne rend jamais ceci avant
 * `SessionProvider`). Seul le CONTENU est un squelette générique, aux
 * proportions de cet écran (bande de décision, carte du maillon faible,
 * chaîne) : `DashboardSkeleton`, le même bloc-silhouette que `/dashboard`
 * (`PersonalCockpit.tsx`) pour un écran de cartes empilées de même nature.
 *
 * `titleInScreen` — même réglage que `PilotagePage` : cet écran écrit son
 * titre dans son corps (`ScreenIntro`), jamais dans l'en-tête. Sans ce
 * réglage ici, l'en-tête afficherait un titre pendant le squelette puis le
 * ferait disparaître à l'arrivée de la vraie page — un décalage visuel que
 * la doctrine de cohérence (design rules) interdit.
 */
export function PilotagePendingSkeleton() {
  return (
    <CustomerPage titleInScreen>
      <div data-testid="pilotage-pending-skeleton" className="flex flex-col gap-4 py-4">
        <DashboardSkeleton className="h-8 w-64" />
        <DashboardSkeleton className="h-[120px]" />
        <DashboardSkeleton className="h-[220px]" />
        <DashboardSkeleton className="h-[220px]" />
      </div>
    </CustomerPage>
  )
}

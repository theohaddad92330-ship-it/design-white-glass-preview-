import { createRootRoute, Outlet } from '@tanstack/react-router'
import { NotFound } from '@/components/organisms/not-found'
import { CrashHandler } from '@/components/templates/crash-handler'
import { useLeaveForeignDemo } from '@/features/auth/hooks/useLeaveForeignDemo'
import { useAnalysisStatusSync } from '@/hooks/useAnalysisStatusSync'
import { useDocumentTitle } from '@/lib/hooks/use-document-title'
import { useSession } from '@/lib/hooks/use-session'
import { SessionProvider } from '@/features/auth/session-provider'
import { SessionRevokedNotice } from '@/features/auth/components/SessionRevokedNotice'
import { SessionUnavailableBanner } from '@/features/auth/components/SessionUnavailableBanner'
import { useProfileContextBackgroundTask } from '@/features/profile-context/hooks/useProfileContextBackgroundTask'
import { WelcomeRedesignBanner } from '@/features/onboarding/components/WelcomeRedesignBanner'
import { ImpersonationBanner } from '@/features/impersonation/ImpersonationBanner'
import { WorkspaceImpersonationNotice } from '@/features/impersonation/WorkspaceImpersonationNotice'
import { FeedbackWidget } from '@/features/feedback/FeedbackWidget'
import { LauraDock } from '@/features/laura/bubble/LauraDock'
import { ProductTour } from '@/features/product-tour/ProductTour'
import { SalesScenario } from '@/features/sales-scenario/SalesScenario'
import { GuideHost } from '@/features/guide/GuideHost'
import { FirstSuccessGuideTrigger } from '@/features/guide/FirstSuccessGuideTrigger'
import { ShortcutsProvider } from '@/features/shortcuts/ShortcutsProvider'
import { BrowserNotificationChannel } from '@/features/notifications/browser-channel/BrowserNotificationChannel'

export const Route = createRootRoute({
  component: RootComponent,
  // Recette 07/10 — une URL hors catalogue (`/opportunities`, `/targets`…)
  // rendait une page BLANCHE. `router.tsx` porte déjà `defaultNotFoundComponent`,
  // mais SEULEMENT sur CETTE instance de routeur : un autre routeur construit
  // depuis `routeTree.gen.ts` (un test, un futur refactor) ne l'hérite pas. Posé
  // ICI, sur la route racine elle-même, l'écran « introuvable » part AVEC
  // l'arbre de routes, quel que soit le routeur qui le monte.
  notFoundComponent: () => <NotFound />,
})

export function SessionContent() {
  const session = useSession()
  useProfileContextBackgroundTask()
  // App-wide: keeps every in-flight analysis reconciled with SERVER STATE, not
  // just with the Socket.IO stream. Mounted at the root because a run's terminal
  // event is most likely to be missed precisely when the user is on some other
  // screen — and because /search, account-detail and « Tâches de fond » all read
  // the same store, so reconciling once fixes all three.
  useAnalysisStatusSync()
  // #5024.2 — un onglet sans marqueur démo ne reste pas dans la démo d'un autre onglet.
  useLeaveForeignDemo()

  if (!session?.user) {
    return <Outlet />
  }

  return (
    <>
      {/* #2897 (#2091.36) — « BellumAI a été repensé », pour les comptes dont
          l'onboarding s'est terminé avant la refonte de l'écran Welcome. EN
          FLUX (pousse le contenu), pas en surcouche — même grammaire que
          `WorkspaceImpersonationNotice` : un bandeau de reprise de contexte ne
          doit ni recouvrir le premier écran ni se faire ignorer comme un
          toast. Ne rend rien tant que le serveur ne dit pas `visible: true`. */}
      <WelcomeRedesignBanner />
      {/* #4541 — plus de barre « En cours » ici (Louis 25/10) : la pastille des tâches de fond et la carte
          de progression disent déjà qu'une analyse tourne (GA-26). */}
      <Outlet />
      {/* Mounted at the root so the bug reporter is reachable from every
          screen — settings, onboarding and full-bleed pages included. */}
      <FeedbackWidget />
      {/* Laura : montée au root parce qu'elle intervient sur N'IMPORTE quel
          écran — et parce que la règle « une intervention par écran » du §5.3
          n'a de sens que si un seul composant la demande.

          `LauraDock` porte les DEUX surfaces : la carte proactive (inchangée,
          seule à appeler `useLaura`) et la bulle appelable en bas à droite. Une
          seule assistante, deux portes — voir son docblock et GA-237. Elle ne
          rend rien quand le serveur se tait, ce qui est le cas le plus
          fréquent. */}
      <LauraDock />
      {/* #1863.3 — la visite guidée, montée au root pour la même raison que les
          deux surfaces ci-dessus : elle doit survivre aux changements de route.
          Elle EMMÈNE sur l'écran de chaque étape, et un composant qui se
          démonte en naviguant ne peut pas tenir le fil jusque-là. Elle ne rend
          rien tant que personne ne l'a lancée depuis « Nouveautés ». */}
      <ProductTour />
      {/* #2731.2 — le scénario commercial, montée au root pour la même raison
          que la visite ci-dessus : il EMMÈNE d'écran en écran (compte →
          contact → message → actions → chat) et doit donc survivre à la
          navigation. Lancé depuis Réglages › Démarrage (`PreferencesView`),
          qui arrête la visite guidée au lancement (et réciproquement) — les
          deux occupent le même emplacement fixe en bas d'écran. Il ne rend
          rien tant que personne ne l'a lancé. */}
      <SalesScenario />
      {/* #2212.2 — le socle du guide dans le produit : le spotlight ancré.
          Monté ici pour les mêmes raisons que les trois surfaces au-dessus — un
          pas de guide peut désigner n'importe quel écran, et un parcours peut
          traverser une navigation. Il ne rend rien tant que personne n'a démarré
          une aide, et rien non plus pendant la recherche de la cible : un halo
          sur du vide se voit, donc il est pire qu'un guide muet. */}
      <GuideHost />
      {/* #2214.23 — le guide 1 « Premier succès BellumAI », le seul du
          registre qui se déclenche seul, une fois l'onboarding terminé. Ne
          rend rien : il ne fait que démarrer le fil de `GuideHost`
          ci-dessus quand `shouldStartFirstSuccessGuide` le dit. */}
      <FirstSuccessGuideTrigger />
      {/* Le clavier (tome 7 §30) : monté au root parce qu'une séquence de
          navigation doit marcher depuis n'importe quel écran. Il ne rend rien
          tant que ⌘/ n'a pas été pressé. */}
      <ShortcutsProvider />
      {/* #1938.3 — le canal notification navigateur : relaie le flux in-app
          existant (le même que la cloche) en notification native de CE
          navigateur, si — et seulement si — un réglage explicite ET la
          permission du navigateur le permettent. Ne rend rien, et surtout
          n'observe rien, tant que ce n'est pas le cas. */}
      <BrowserNotificationChannel />
    </>
  )
}

function RootComponent() {
  // Titre + meta description pour TOUTES les routes, au même endroit : chaque
  // écran avait son propre beforeLoad, plusieurs n'en avaient aucun et l'onglet
  // gardait alors le titre de l'écran précédent.
  useDocumentTitle()

  return (
    <CrashHandler>
      {/* App-wide: consumes an impersonation token from the URL fragment and shows
          the persistent "⚠️ Vous incarnez … — Quitter" banner while a read-only
          impersonation session is active. Renders nothing otherwise. */}
      <ImpersonationBanner />
      {/* #1670.2 — l'AUTRE bandeau, et il ne s'adresse pas au même public : celui
          du dessus dit à l'OPÉRATEUR qu'il incarne quelqu'un ; celui-ci dit au
          CLIENT qu'un membre de l'équipe est chez lui. Il ne s'affiche jamais
          dans une session d'incarnation — sinon l'opérateur croirait qu'une
          deuxième personne est là. Rend `null` le reste du temps. */}
      <WorkspaceImpersonationNotice />
      {/* #2435.6 — une panne serveur n'est pas une déconnexion. Monté en frère
          de `SessionProvider`, PAS dedans : celui-ci bloque le rendu de ses
          enfants tant que `loading` est vrai, et le cas mesuré (429/5xx dès
          le tout premier `loadSession`) doit rester visible pendant ce
          blocage. Lit `sessionManager` directement — ne rend rien le reste
          du temps. */}
      <SessionUnavailableBanner />
      <SessionProvider>
        <SessionContent />
      </SessionProvider>
      {/* R15-7 (15/09/2026) — un appareil révoqué le DIT, sur n'importe quel écran,
          au lieu de laisser une coquille vide. Ne rend rien le reste du temps. */}
      <SessionRevokedNotice />
    </CrashHandler>
  )
}

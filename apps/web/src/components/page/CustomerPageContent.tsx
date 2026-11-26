import { RedirectTo } from '@/components/navigation/RedirectTo'
import { cn, type TabNavItem } from '@bellum/ui'
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { DemoModeBanner } from '@/components/layout/DemoModeBanner'
import { OnboardingRefreshBanner } from './OnboardingRefreshBanner'
import { OnboardingPermanentLink } from './OnboardingPermanentLink'
import { isHomeRoute } from '@/features/onboarding/lib/onboarding-link-access'
import { ReturnToConversationBanner } from './ReturnToConversationBanner'
import { SectionTabs } from '@/components/navigation/SectionTabs'
import { PageHeader, type PageBreadcrumb } from '@/components/layout/PageHeader'
import { ScreenGuideLink } from '@/components/shell/ScreenGuideLink'
import { ScreenGuideSlotProvider } from '@/components/shell/ScreenGuideSlot'
import { ShellTopbar } from '@/components/shell/ShellTopbar'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { useOnboardingStatus } from '@/features/profiles/hooks/useOnboardingStatus'
import { useSession } from '@/lib/hooks/use-session'
import { rememberPreLoginTarget } from '@/features/auth/lib/pre-login-target'
import { CapabilityBanner } from '@/components/access/CapabilityBanner'
import { useCurrentRouteAccess } from '@/components/access/useRouteAccess'
import { consumeReturnToAppScrollIfMatching, trackContentScrollTop } from '@/lib/return-to-app'
import { isFeedbackWidgetHiddenOnMobilePath } from '@/features/feedback/feedback-widget-visibility'
import { GlobalLoadingState } from '../GlobalLoadingState'
import { PAGE_GUTTER_X, pageContentClassName } from './page-gutter'

export { CONTENT_PADDING, PAGE_GUTTER_MX, PAGE_GUTTER_X, PAGE_GUTTER_Y } from './page-gutter'

type CustomerPageContentProps = {
  children: ReactNode
  /**
   * Hide chrome banners (credits warning, onboarding tips, etc.) — used by
   * full-bleed screens that bypass the surrounding chrome via `skipLayout`.
   */
  skipBanners?: boolean
  tabs?: TabNavItem[]
  activeTab?: string
  onTabChange?: (key: string) => void
  /** Page-contextual controls rendered on the right of the header. */
  headerActions?: ReactNode
  /** Overrides the auto-resolved page title / breadcrumb terminus. */
  pageTitle?: string
  /** Inline accessory rendered next to the title (e.g. a count badge). */
  pageTitleBadge?: ReactNode
  /** Coque Théo — la phrase sous le titre (`.page-head p`). */
  pageSubtitle?: string
  /** Explicit breadcrumb trail, overriding the route-based auto-resolution. */
  breadcrumbs?: PageBreadcrumb[]
  /** Tailwind classes merged onto the inner content wrapper (default: `CONTENT_PADDING`, `page-gutter.ts`). */
  contentClassName?: string
  /**
   * Skip the `<PageHeader>` entirely — used by full-bleed views that draw
   * their own chrome (e.g. `/search` Linear-style composer).
   */
  skipHeader?: boolean
  /**
   * #2456 — cet écran écrit son titre de niveau 1 LUI-MÊME, dans son corps :
   * l'entête ne lui en donne pas un second. Défaut `false`, qui est le
   * comportement SÛR — un écran muet par oubli reste impossible.
   */
  titleInScreen?: boolean
  /** #2958.5 — id posé sur l'enveloppe du contenu (ancre de `/route#ancre`). */
  anchorId?: string
  /** Refonte Théo — le corps du guide propre à l'écran, déplié sous l'en-tête (`ScreenGuideLink`). */
  screenGuide?: ReactNode
}

// #1846 — la gouttière de page (valeur inchangée) vit désormais dans
// `page-gutter.ts`, importée ci-dessus, et réexportée pour les écrans qui
// l'importaient déjà d'ici.
export const CustomerPageContent = memo<CustomerPageContentProps>(function CustomerPageContent({
  children,
  skipBanners,
  tabs,
  activeTab,
  onTabChange,
  headerActions,
  pageTitle,
  pageTitleBadge,
  pageSubtitle,
  breadcrumbs,
  contentClassName,
  skipHeader,
  titleInScreen,
  anchorId,
  screenGuide,
}) {
  const { user } = useSession()
  // #2117.84 — recette iPhone du 25/09 : le bouton flottant de signalement
  // (`fixed`, hors du flux) se peignait sur les dernières lignes d'une liste
  // une fois défilée jusqu'au bout. Réservé plus bas, APRÈS `children`.
  const isMobile = useIsMobile()
  const { needsOnboarding, isLoading } = useOnboardingStatus()
  // #2145.19 — « Retour à l'app » (`SettingsNavbarBody`) ramène déjà à la
  // route, ses filtres et son objet (le `href` mémorisé) ; il lui manquait le
  // DÉFILEMENT quitté. Ce conteneur est le SEUL qui défile réellement
  // (`overflow-y-auto`, GA-26) — restituer ailleurs dupliquerait ce réglage.
  // `window.location`, pas `useLocation` : cette coque se rend aussi dans des
  // tests qui ne simulent que `Link`/`useNavigate` (pas tout le routeur), et
  // ce composant est REMONTÉ à chaque navigation — jamais gardé en vie entre
  // deux routes — donc lire l'URL une fois au montage suffit.
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`
    const restored = consumeReturnToAppScrollIfMatching(currentHref)
    if (restored === null) return
    trackContentScrollTop(restored)
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = restored
  }, [])
  // #2222 — le contrat de CET écran, lu au catalogue. L'ancienne prop
  // `requiredPermissions` a disparu : elle n'était passée par AUCUN écran, donc
  // le garde qu'elle commandait n'a jamais tourné. Ce qu'un écran exige se
  // déclare désormais à UN endroit (`PRODUCT_SCREENS`, GA-26), et se DÉRIVE du
  // `@RequirePermission` de l'endpoint qui le remplit.
  const { pending, access } = useCurrentRouteAccess()
  // #4654 — « Comment travailler ici ? » sur la rangée du titre de l'écran : voir `ScreenGuideSlot`. L'emplacement n'est
  // offert que là où l'en-tête de la coque n'aurait porté QUE le lien (écran `titleInScreen`, sans gestes ni onglets
  // d'en-tête, sans guide propre) ; ailleurs le lien reste dans la rangée des gestes (#4578).
  const guideSlotOffered = Boolean(titleInScreen) && !headerActions && !(tabs && tabs.length > 0) && !screenGuide
  const [guideSlotOwner, setGuideSlotOwner] = useState<string | null>(null)
  const claimGuideSlot = useCallback((id: string) => setGuideSlotOwner(current => current ?? id), [])
  const releaseGuideSlot = useCallback(
    (id: string) => setGuideSlotOwner(current => (current === id ? null : current)),
    [],
  )
  const lauraDockClearance = access.state !== 'permission' && !window.location.pathname.startsWith('/chat')

  if (!user) {
    // #2145.7 — retenir la page demandée AVANT de partir vers /login : un
    // lien profond (compte, notification) ouvert sans session ramène sur
    // l'objet exact, jamais sur la destination générique post-connexion
    // (`useRedirectAfterAuth` la consomme, sauf onboarding — #2145.8).
    rememberPreLoginTarget(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
      window.location.pathname,
    )
    return <RedirectTo to="/login" />
  }
  if (isLoading) {
    return <GlobalLoadingState />
  }
  // Même prédicat que le garde de `/onboarding` — c'est ce qui empêche les deux
  // de se renvoyer la balle indéfiniment (voir `onboarding-gate.ts`).
  if (needsOnboarding) return <RedirectTo to="/onboarding" />

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Coque Théo (23/10/2026) — la barre du haut (fil d'Ariane, recherche ⌘K, compte), sur
          bureau. Sous 768 px, la coque mobile garde son en-tête et ses quatre onglets (GA-28). */}
      {!skipBanners && !isMobile ? <ShellTopbar breadcrumbs={breadcrumbs} pageTitle={pageTitle} /> : null}
      {/* Demo mode (C1): permanent strip on every chrome page of a demo workspace. */}
      {!skipBanners && <DemoModeBanner />}
      {/* MAQ-SHELL fiche de lecture (validé 19/10) — l'ordre des bandeaux : session (racine), démo, droit
          (dans le corps), retour à la conversation, annonce (racine), questionnaire, installation. */}
      {/* #1933.8 / #1903.20 — « Revenir à la conversation » sur toute page ouverte
          par Laura (`?from=chat:<id>`). Rend `null` sans ce paramètre : comportement
          inchangé sur un écran ouvert autrement. */}
      {!skipBanners && <ReturnToConversationBanner />}
      {/* #2021 — « Questionnaire en cours — Reprendre », pour un utilisateur déjà
          onboardé qui a redemandé une reconfiguration (`status: 'refresh_required'`)
          et que `needsOnboarding` ne redirige plus. Rend `null` dans tous les autres
          cas (voir `shouldShowOnboardingRefreshBanner`, `onboarding-gate.ts`). */}
      {!skipBanners && <OnboardingRefreshBanner />}
      {/* #4364.2 — le chemin PERMANENT vers le questionnaire, sur l'accueil, sans aucun drapeau : le bandeau
          ci-dessus ne couvre que `refresh_required`, il RESTE. Qui le voit : `canSeeOnboardingLink`. */}
      {!skipBanners && isHomeRoute(window.location.pathname) && <OnboardingPermanentLink />}
      {/* Les onglets de SECTION (nav à neuf entrées) : ils mènent aux surfaces
          absorbées — la messagerie sous « Aujourd'hui », les contacts sous
          « Comptes », les appels d'offres sous « Projets ». Ils sont montés ici
          plutôt que dans chaque écran pour la même raison que la barre latérale
          n'est pas recopiée dans chaque page : une navigation qui dépend de
          l'écran finit par manquer sur celui qu'on a oublié.

          Ils NE remplacent PAS les onglets propres à une page (`tabs`), qui
          restent dans l'entête : « Vue d'ensemble / Contacts / Plan » d'un
          dossier n'a rien à voir avec « Comptes / Contacts / Découvrir ». */}
      {!skipHeader && (
        <div className={cn('border-b border-[var(--bellum-border)] pt-2 empty:hidden', PAGE_GUTTER_X)}>
          <SectionTabs />
        </div>
      )}
      {!skipHeader && (
        <PageHeader
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
          actions={headerActions}
          guideLink={screenGuide || (guideSlotOffered && guideSlotOwner !== null) ? undefined : <ScreenGuideLink />}
          pageTitle={pageTitle}
          pageTitleBadge={pageTitleBadge}
          pageSubtitle={pageSubtitle}
          breadcrumbs={breadcrumbs}
          trailInTopbar={!skipBanners && !isMobile}
          titleInScreen={titleInScreen}
        />
      )}
      {/* Coque Théo — « Comment travailler ici ? » (`.v18-guide`). Sans guide propre, c'est un lien : il vit dans
          l'en-tête avec les gestes de la page (#4578), jamais sur une ligne à part. Avec un guide, c'est un repli
          qui se déplie en carte : il ne tient pas dans une rangée d'en-tête, il reste sous elle. */}
      {!skipHeader && screenGuide && (
        <div className={cn('shrink-0', PAGE_GUTTER_X)}>
          <ScreenGuideLink guide={screenGuide} />
        </div>
      )}
      <div
        ref={scrollContainerRef}
        onScroll={e => trackContentScrollTop(e.currentTarget.scrollTop)}
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-y-auto',
          // #3480 — la bulle de Laura (`LauraDock`) est fixe, en bas à droite, dès
          // 768 px : `bottom-4` + 48 px = 64 px, 80 px avec la respiration. La
          // réserve est le PADDING BAS du conteneur qui défile, pas une bande
          // enfant : un enfant se calait sur son enveloppe (`flex-1 min-h-full`,
          // comprimée à la hauteur visible), à −11 611 px de la vraie fin
          // (recette prod 01/10). Le padding du conteneur suit le défilement
          // réel, quelle que soit la hauteur de l'enveloppe. Pas sur /chat : cet
          // écran gère son propre défilement (`h-full`, GA-328).
          lauraDockClearance && 'md:pb-20',
        )}
        data-testid="laura-dock-clearance"
      >
        {/* `flex-1` sur l'enveloppe : un écran qui demande `h-full` — le
            copilote, qui gère son propre défilement — doit pouvoir remplir la
            hauteur restante. Sans lui, `h-full` se résout contre un parent de
            hauteur automatique et la zone de saisie tombe sous le pli. */}
        {/* GA-284 (ter) — la gouttière rencontre le `contentClassName` de l'écran dans la primitive,
            et un padding que l'écran écrit y vaut à TOUS les paliers (`page-gutter.ts`). */}
        {/* #3480 (RÉFUTÉ en recette 01/10) — le padding du scroller ne suffisait
            pas : `CONTENT_BASE` pose `min-h-0 flex-1` sur CETTE enveloppe, qui se
            comprime donc à la hauteur visible du scroller ; le contenu DÉBORDE
            d'elle, et le padding bas du scroller se pose après l'enveloppe, pas
            après le débordement (dernière carte à 15 px du bas au lieu de 80).
            Mesuré dans Chromium sur la même structure : écart au bas 0 px avec
            `min-height: 0`, 80 px avec `fit-content`. Sous la bulle (md+, hors
            /chat), l'enveloppe ne descend donc plus sous la hauteur de son
            contenu. */}
        <div id={anchorId} className={cn(pageContentClassName(contentClassName), lauraDockClearance && 'md:min-h-fit')}>
          {/* #2222 — LE REFUS SE DIT.
              Avant : une permission manquante renvoyait au tableau de bord sans
              un mot, ce qui se lit comme un bug (« j'ai cliqué, il ne se passe
              rien »). Le bandeau NOMME le droit qui manque et le destinataire —
              un responsable de l'espace.

              L'ATTENTE vient d'abord, et jamais un refus : tant que le rôle
              n'est pas revenu de `GET /workspaces/me`, il est INCONNU, et
              inconnu n'est pas « aucun droit ». Sans cette branche, un écran
              que la personne paie clignoterait un refus d'accès à chaque
              rechargement de page.

              La coque RESTE en place dans les deux cas : un refus qui retire la
              barre latérale enferme quelqu'un sur un écran qu'il ne peut pas
              quitter. */}
          {pending ? (
            <GlobalLoadingState />
          ) : (
            <>
              <CapabilityBanner access={access} />
              {access.state === 'permission' ? null : guideSlotOffered ? (
                <ScreenGuideSlotProvider owner={guideSlotOwner} claim={claimGuideSlot} release={releaseGuideSlot}>
                  {children}
                </ScreenGuideSlotProvider>
              ) : (
                children
              )}
              {/* #2117.84 — la même marge que le repli du bouton flottant
                  (`bottom-[calc(1rem+var(--bellum-mobile-nav-height,0px))]`,
                  `FeedbackWidget.tsx`, ~40px + marges) : défiler jusqu'au bout
                  laisse cette bande vide au-dessus de lui, jamais du contenu
                  réel dessous. Desktop n'a pas ce bouton à cette taille ni
                  cette position fixe : rien à réserver au-delà de 768px.

                  #3050 (27/09/2026) — ni sur /chat mobile : le bouton s'y tait
                  déjà (`isFeedbackWidgetHiddenOnMobilePath`, même prédicat que
                  `FeedbackWidget.tsx`), et cet écran gère tout son propre
                  défilement (`h-full`, GA-328). Réserver 64px pour un bouton
                  absent mangeait le budget de hauteur du fil — mesuré : 38%
                  au lieu des ≈ 100% - en-tête - composeur - navigation visés. */}
              {isMobile &&
              access.state !== 'permission' &&
              !isFeedbackWidgetHiddenOnMobilePath(window.location.pathname) ? (
                <div aria-hidden className="h-16 shrink-0" />
              ) : null}
              {/* E25 (recette démo 04/10) — la ligne d'amorce de Laura (fixe, bas droite) recouvrait la dernière
                  ligne du tableau /missions. `LauraDock` pose `--bellum-laura-intro-reserve` tant qu'elle est
                  montrée (`intro-bar-reserve.ts`) ; sans elle la bande vaut 0. */}
              {/* Pas sur /chat : cet écran gère son propre défilement (même règle que `lauraDockClearance`). */}
              {lauraDockClearance ? (
                <div aria-hidden className="h-[var(--bellum-laura-intro-reserve,0px)] shrink-0" />
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
})

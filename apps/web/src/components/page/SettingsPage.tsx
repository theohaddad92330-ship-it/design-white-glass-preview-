import { RedirectTo } from '@/components/navigation/RedirectTo'
import { DemoModeBanner } from '@/components/layout/DemoModeBanner'
import { MenuPage } from '@bellum/ui'
import { memo, useMemo, type ReactNode } from 'react'
import { CONTENT_PADDING } from '@/components/page/page-gutter'
import { SettingsNavbarBody } from '@/components/sidebar/SettingsNavbarBody'
import { MobileShell } from '@/features/mobile/MobileShell'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { useOnboardingStatus } from '@/features/profiles/hooks/useOnboardingStatus'
import { useSession } from '@/lib/hooks/use-session'
import { GlobalLoadingState } from '../GlobalLoadingState'

type SettingsPageContentProps = {
  children: ReactNode
  anchorId?: string
}

const SettingsPageContent = memo<SettingsPageContentProps>(function SettingsPageContent({ children, anchorId }) {
  const { user } = useSession()
  const { needsOnboarding, isLoading } = useOnboardingStatus()

  if (!user) return <RedirectTo to="/login" />
  if (isLoading) {
    return <GlobalLoadingState />
  }
  if (needsOnboarding) return <RedirectTo to="/onboarding" />

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Recette prod 02/10 : « /settings en démo : bandeau MODE DÉMO absent sur
          Préférences » — la bande permanente vit dans `CustomerPageContent`, et
          cette coque-ci ne la montait pas. Même composant, même source (`useCredits`). */}
      <DemoModeBanner />
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* #1846 — la même échelle que `CustomerPageContent` (`page-gutter.ts`),
            au lieu d'une seconde coque qui la retapait avec un rythme vertical
            légèrement différent (`py-6` fixe plutôt que `py-4 md:py-6`). */}
        <div id={anchorId} className={`mx-auto ${CONTENT_PADDING}`}>
          {children}
        </div>
        {/* #3480 — la même bande que `CustomerPageContent` : la bulle de Laura
            (fixe, dès 768 px) ne recouvre pas le bas d'un réglage. */}
        <div aria-hidden className="hidden h-20 shrink-0 md:block" />
      </div>
    </div>
  )
})

type SettingsPageProps = {
  children: ReactNode
  /** #2958.5 — l'ancre (id) du contenu de l'écran. */
  anchorId?: string
  /**
   * L'écran écrit son propre titre de niveau 1. Réglages ne monte jamais de `PageHeader` : la déclaration ne change
   * rien au rendu, elle dit à la garde GA-347 que cet écran ne reçoit pas un second titre d'une coque `CustomerPage`
   * qu'il n'affiche que VERROUILLÉ (`PlanFeatureRoute`) — jamais en même temps que son titre.
   */
  titleInScreen?: boolean
}

/**
 * Layout wrapper for `/settings/*` pages — replaces the main app sidebar
 * with a Linear-style settings sidebar (sections, no NavUser footer).
 */
export const SettingsPage = memo<SettingsPageProps>(function SettingsPage({ children, anchorId }) {
  const isMobile = useIsMobile()
  const memoizedSidebar = useMemo(() => <SettingsNavbarBody />, [])

  /**
   * Sur un téléphone, la barre latérale des réglages passe AU-DESSUS du contenu.
   *
   * Mesuré à l'écran : elle occupait 240 px des 500 disponibles et écrasait la
   * page à 250 — le texte s'enroulait tous les trois mots et « Connecter
   * Salesforce » était coupé. Une barre latérale de bureau posée à côté d'un
   * contenu sur un écran étroit ne laisse ni l'un ni l'autre lisible.
   *
   * Elle n'est PAS retirée : les quatorze entrées de réglages restent
   * atteignables, empilées au-dessus, et l'on retrouve la barre d'onglets de
   * l'application en bas — ce que la coque de bureau ne donnait pas non plus.
   */
  if (isMobile) {
    return (
      <MobileShell>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-[var(--bellum-border)]">{memoizedSidebar}</div>
          <SettingsPageContent anchorId={anchorId}>{children}</SettingsPageContent>
        </div>
      </MobileShell>
    )
  }

  return (
    <MenuPage
      menuBody={memoizedSidebar}
      pageContent={<SettingsPageContent anchorId={anchorId}>{children}</SettingsPageContent>}
    />
  )
})

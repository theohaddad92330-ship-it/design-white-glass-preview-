import { MenuPage, type TabNavItem } from '@bellum/ui'
import { memo, useMemo, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { CustomerNavbarBody } from '@/components/sidebar/CustomerNavbarBody'
import type { PageBreadcrumb } from '@/components/layout/PageHeader'
import { ContactEngagementTabs } from '@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementProvider'
import { useOptionalContactEngagement } from '@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext'
import { useSession } from '@/lib/hooks/use-session'
import { MobileShell } from '@/features/mobile/MobileShell'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { CustomerPageContent } from './CustomerPageContent'
import { CustomerPageFooter } from './CustomerPageFooter'

type CustomerPageProps = {
  children: ReactNode
  /**
   * Opt out of the sidebar/header chrome — useful for full-bleed screens.
   * Banners are also skipped to keep the surface minimal.
   */
  skipLayout?: boolean
  /**
   * Optional sub-navigation tabs displayed in the page header.
   */
  tabs?: TabNavItem[]
  activeTab?: string
  onTabChange?: (key: string) => void
  /** Page-contextual controls rendered on the right of the header. */
  headerActions?: ReactNode
  /** Overrides the auto-resolved page title / breadcrumb terminus. */
  pageTitle?: string
  /** Inline accessory rendered next to the title (e.g. a count badge). */
  pageTitleBadge?: ReactNode
  /** Coque Théo — la phrase sous le titre (`.page-head p`, 70 caractères de large au plus). */
  pageSubtitle?: string
  /** Explicit breadcrumb trail, overriding the route-based auto-resolution. */
  breadcrumbs?: PageBreadcrumb[]
  /** Tailwind classes merged onto the inner content wrapper (default: `CONTENT_PADDING` — see `page-gutter.ts`). */
  contentClassName?: string
  /** Skip the `<PageHeader>` — for full-bleed views that draw their own chrome. */
  skipHeader?: boolean
  /** Optional full-width footer rendered under the content card. */
  footer?: ReactNode
  /**
   * #2456 — cet écran écrit son titre de niveau 1 LUI-MÊME, dans son corps :
   * l'entête ne lui en donne pas un second. Défaut `false`, qui est le
   * comportement SÛR — un écran muet par oubli reste impossible.
   */
  titleInScreen?: boolean
  /** #2958.5 — l'ancre (id) posée sur le contenu de l'écran : `/route#ancre` y défile. */
  anchorId?: string
  /** Refonte Théo — le corps du guide « Comment travailler ici ? » propre à l'écran (`.v18-guide-body`). */
  screenGuide?: ReactNode
}

export const CustomerPage = memo<CustomerPageProps>(function CustomerPage({
  children,
  skipLayout = false,
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
  footer,
  titleInScreen,
  anchorId,
  screenGuide,
}) {
  const { user } = useSession()
  const isMobile = useIsMobile()
  const contactEngagement = useOptionalContactEngagement()
  // D34 (Louis, 28/08/2026) — une seule coque, pour tout le monde.
  //
  // Cette ligne lisait `hasBackofficeRole(user?.roles)` et basculait sur une
  // barre latérale RÉDUITE à l'entrée « Dashboard » du back-office : un
  // opérateur perdait Comptes, Contacts, Laura, Réglages… sur tous les écrans du
  // produit. Un opérateur reste un utilisateur ; son entrée back-office s'ajoute
  // à la barre client (`CustomerNavbarBody`) au lieu de la remplacer.
  const memoizedNavbar = useMemo(() => <CustomerNavbarBody user={user} />, [user])
  // Le pied de page ne sert plus QU'aux onglets d'engagement contact : sans
  // engagement ouvert, on ne réserve pas la bande de 30px. (Elle était
  // auparavant toujours occupée par la pastille « Copilote partagé », retirée
  // au profit de l'entrée « Copilote IA » de la barre latérale.)
  const hasEngagementTabs = (contactEngagement?.lastEngagement?.contacts.length ?? 0) > 0
  const engagementFooter = hasEngagementTabs ? (
    <motion.div
      key="contact-engagement-tabs"
      initial={{ height: 0, opacity: 0, y: 8 }}
      animate={{ height: 30, opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className="min-w-0 w-full overflow-hidden"
    >
      <CustomerPageFooter>
        <ContactEngagementTabs />
      </CustomerPageFooter>
    </motion.div>
  ) : null
  const resolvedFooter =
    footer || engagementFooter ? (
      <>
        {footer}
        {engagementFooter}
      </>
    ) : null

  // La coque MOBILE remplace la barre latérale par une barre d'onglets, sans
  // toucher au contenu : chaque écran reste le même, atteignable par la même
  // route, partageable par le même lien. Un second arbre de routes « mobile »
  // aurait produit deux produits à maintenir, et l'un des deux aurait pris du
  // retard sur l'autre — c'est toujours celui qu'on regarde le moins.
  if (isMobile && !skipLayout) {
    return (
      <MobileShell>
        <CustomerPageContent
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
          headerActions={headerActions}
          pageTitle={pageTitle}
          pageTitleBadge={pageTitleBadge}
          pageSubtitle={pageSubtitle}
          breadcrumbs={breadcrumbs}
          contentClassName={contentClassName}
          skipHeader={skipHeader}
          titleInScreen={titleInScreen}
          anchorId={anchorId}
          screenGuide={screenGuide}
        >
          {children}
        </CustomerPageContent>
      </MobileShell>
    )
  }

  if (skipLayout) {
    return (
      <CustomerPageContent skipBanners skipHeader={skipHeader} contentClassName={contentClassName} anchorId={anchorId}>
        {children}
      </CustomerPageContent>
    )
  }

  // The bug reporter is mounted once at the router root, not per layout.
  return (
    <MenuPage
      menuBody={memoizedNavbar}
      footer={resolvedFooter}
      pageContent={
        <CustomerPageContent
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
          headerActions={headerActions}
          pageTitle={pageTitle}
          pageTitleBadge={pageTitleBadge}
          pageSubtitle={pageSubtitle}
          breadcrumbs={breadcrumbs}
          contentClassName={contentClassName}
          skipHeader={skipHeader}
          titleInScreen={titleInScreen}
          anchorId={anchorId}
          screenGuide={screenGuide}
        >
          {children}
        </CustomerPageContent>
      }
    />
  )
})

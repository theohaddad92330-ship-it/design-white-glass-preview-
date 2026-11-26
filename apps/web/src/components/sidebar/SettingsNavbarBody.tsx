import { Link, useLocation } from '@tanstack/react-router'
import {
  cn,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@bellum/ui'
import { ChevronLeft, Search } from 'lucide-react'
import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { hasPermission } from '@bellum/contracts'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { useTeam } from '@/features/team/hooks/useTeam'
import { consumeSettingsOpenedFromLaura, resolveSettingsFallbackRoute } from '@/features/laura/laura-settings-origin'
import { DEFAULT_VIEW_ROUTE, useReadPreferences } from '@/features/preferences/preferences-provider'
import { readReturnToApp } from '@/lib/return-to-app'
import { BackgroundTasksIndicator } from './background-tasks/BackgroundTasksIndicator'
import { COLLAPSED_ENTRY, COLLAPSED_GUTTER, HIDDEN_WHEN_COLLAPSED } from './collapsed'
import type { SidebarSection } from './items'
import { SETTINGS_SECTIONS } from './items.settings'
import { isNavActive } from './settings-nav-active'
import { filterSettingsSections } from './settings-nav-search'
import { SidebarCollapseToggle } from './SidebarCollapseToggle'
import { SidebarFooterActions } from './SidebarFooterActions'
import { useSidebarCollapsePreference } from './useSidebarCollapsePreference'

function SettingsNavSection({ section }: { section: SidebarSection }) {
  const location = useLocation()
  const { t } = useTranslation('nav')
  return (
    <SidebarGroup className="p-0">
      {section.labelKey && (
        <SidebarGroupLabel className="text-xs px-0 text-[var(--bellum-text-secondary)]">
          {t(section.labelKey)}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {section.items
            .filter(item => item.aliasOf === undefined)
            .map(item => {
              const active = isNavActive(String(item.to ?? ''), location.pathname)
              return (
                <SidebarMenuItem
                  key={String(item.to)}
                  /* `pointerFineOnly` : masquée en CSS, dans le MÊME rendu — une
                   branche `isMobile ? null :` donnerait deux arbres selon la
                   largeur, ce que les règles mobiles du dépôt refusent. */
                  className={item.pointerFineOnly === true ? 'hidden pointer-fine:block' : undefined}
                >
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    // Repliée, l'entrée n'affiche plus que son icône : l'infobulle
                    // est le seul moyen de la lire à l'œil (elle ne se montre que
                    // dans cet état).
                    tooltip={t(item.labelKey)}
                    className={cn(
                      'rounded-lg text-sm transition-all duration-150 h-auto py-1.5',
                      COLLAPSED_ENTRY,
                      active
                        ? 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-surface-2)] data-[active=true]:bg-[var(--bellum-surface-2)] data-[active=true]:text-[var(--bellum-text-primary)]'
                        : 'text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]',
                    )}
                  >
                    <Link to={item.to}>
                      <item.icon
                        className={cn(
                          'size-4 shrink-0',
                          active ? 'text-[var(--bellum-text-primary)]' : 'text-[var(--bellum-text-muted)]',
                        )}
                      />
                      <span>{t(item.labelKey)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

// Drop manager-only entries (the "Journal d'activité") for roles without
// `team:manage` — same pattern as CustomerNavbarBody. The page + API also
// enforce it; this just keeps the nav honest.
function gateManagerItems(section: SidebarSection, canManage: boolean): SidebarSection {
  if (canManage) return section
  return { ...section, items: section.items.filter(item => !item.managerOnly) }
}

export const SettingsNavbarBody = memo(function SettingsNavbarBody() {
  const { t } = useTranslation('nav')
  const { team } = useTeam()
  const canManage = team ? hasPermission(team.workspace.role, 'team:manage') : false
  // Même préférence, même mécanisme que la barre de l'application : replier ici
  // et retrouver déplié là serait un réglage qui vit à deux endroits.
  useSidebarCollapsePreference()
  // Sous 768 px, pas de repli : `Sidebar` répond au mobile par un tiroir fermé,
  // et cette barre-là est la SEULE navigation des Réglages sur téléphone.
  const isMobile = useIsMobile()
  // `useReadPreferences` — jamais `usePreferences` : cette barre se rend aussi
  // sans `<PreferencesProvider>` (tests d'isolation, `SidebarCollapse.test.tsx`)
  // et un réglage d'affichage manquant doit retomber sur son défaut, pas lever.
  const preferences = useReadPreferences()
  // #2925 (#2145.20) — consommé UNE fois, au montage : cette barre reste
  // montée tout le temps de la visite des Réglages (une sous-navigation ne la
  // remonte pas), donc une seule lecture suffit pour toute la visite.
  const [openedFromLaura] = useState(consumeSettingsOpenedFromLaura)
  // Théo D settings-prefs.N2 — « Rechercher un réglage… » filtre les rubriques.
  const [query, setQuery] = useState('')
  const visibleSections = filterSettingsSections(SETTINGS_SECTIONS, query, key => t(key))
  // #2112.23-25 — LA page d'ORIGINE, jamais `/dashboard` en dur. Inconnue
  // (arrivée directe, nouvel onglet) → #2925 (#2145.20/.22) : Laura, si le
  // clic en venait, sinon la vue de démarrage PRÉFÉRÉE de l'utilisateur
  // (#2112.24), pas un défaut deviné ici.
  const returnTo =
    readReturnToApp() ?? resolveSettingsFallbackRoute(openedFromLaura, DEFAULT_VIEW_ROUTE[preferences.defaultView])
  return (
    <Sidebar collapsible={isMobile ? 'none' : 'icon'} className="w-[var(--sidebar-width)] shrink-0 h-full">
      <SidebarHeader className={cn('px-4 pt-4 gap-3', COLLAPSED_GUTTER)}>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <Link
            to={returnTo}
            className={cn(
              'flex w-fit items-center gap-1 rounded-lg px-2 py-1 text-sm text-[var(--bellum-text-secondary)] transition-colors hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]',
              HIDDEN_WHEN_COLLAPSED,
            )}
          >
            <ChevronLeft className="size-4" />
            <span>{t('backToApp')}</span>
          </Link>
          <SidebarCollapseToggle />
        </div>
        <div className={HIDDEN_WHEN_COLLAPSED}>
          <BackgroundTasksIndicator />
        </div>
      </SidebarHeader>

      <SidebarContent className={cn('px-4 gap-4', COLLAPSED_GUTTER)}>
        <div className={cn('relative', HIDDEN_WHEN_COLLAPSED)}>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--bellum-text-muted)]"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('settingsSearch.placeholder')}
            aria-label={t('settingsSearch.placeholder')}
            className="h-11 w-full rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] pl-8 pr-2 text-sm text-[var(--bellum-text-primary)] placeholder:text-[var(--bellum-text-muted)]"
          />
        </div>
        {visibleSections.map((section, i) => (
          <SettingsNavSection key={section.labelKey ?? i} section={gateManagerItems(section, canManage)} />
        ))}
        {visibleSections.length === 0 && (
          <p className={cn('px-1 text-sm text-[var(--bellum-text-secondary)]', HIDDEN_WHEN_COLLAPSED)}>
            {t('settingsSearch.empty')}
          </p>
        )}
      </SidebarContent>

      <SidebarFooter className={cn('px-4 pb-2', COLLAPSED_GUTTER)}>
        <SidebarFooterActions />
      </SidebarFooter>
    </Sidebar>
  )
})

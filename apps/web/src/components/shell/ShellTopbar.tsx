import { Link, useLocation } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { capitalize } from '@bellum/utils'
import { useBrand } from '@/features/brand/brand-context'
import { useGlobalSearchStore } from '@/features/global-search/globalSearchStore'
import { GlobalSearchTrigger } from '@/components/sidebar/GlobalSearchTrigger'
import { NavIdentity } from '@/components/sidebar/NavUser'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { shellTrail, type PageBreadcrumb } from './shell-trail'

type ShellTopbarProps = {
  /** Le fil que l'écran déclare (`CustomerPage.breadcrumbs`) ; sinon dérivé du modèle. */
  breadcrumbs?: PageBreadcrumb[]
  /** Le dernier maillon que l'écran déclare (`CustomerPage.pageTitle`). */
  pageTitle?: string
}

/**
 * Coque Théo (23/10/2026) — la barre du haut des maquettes appliquées (`.topbar`) :
 * 64 px, fond de la barre latérale, liseré bas ; le fil d'Ariane à gauche, la
 * recherche globale (⌘K) et l'avatar du compte à droite.
 *
 * Bureau seulement : sous 768 px, la coque mobile (`MobileShell`) garde son en-tête et
 * ses quatre onglets (GA-28) — cette barre n'est pas montée.
 */
export const ShellTopbar = memo<ShellTopbarProps>(function ShellTopbar({ breadcrumbs, pageTitle }) {
  const { t } = useTranslation('nav')
  const location = useLocation()
  const brand = useBrand()
  const openGlobalSearch = useGlobalSearchStore(state => state.open)
  const trail = shellTrail(location.pathname, t, brand.name, { breadcrumbs, pageTitle })

  return (
    <header
      data-shell="topbar"
      className={`flex h-16 shrink-0 items-center gap-3.5 border-b border-[var(--bellum-border)] bg-[var(--bellum-sidebar)] ${PAGE_GUTTER_X}`}
    >
      <nav aria-label={t('shell.breadcrumb')} className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-2 text-xs">
          {trail.map((crumb, index) => {
            const last = index === trail.length - 1
            const label = capitalize(crumb.label)
            return (
              <li key={`${index}-${crumb.label}`} className="flex min-w-0 items-center gap-2">
                {index > 0 ? (
                  <ChevronRight className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
                ) : null}
                <span className="min-w-0 truncate">
                  {last ? (
                    <span aria-current="page" className="text-[var(--bellum-text-primary)]">
                      {label}
                    </span>
                  ) : crumb.onClick ? (
                    <button
                      type="button"
                      onClick={crumb.onClick}
                      className="cursor-pointer text-[var(--bellum-text-muted)] transition-colors duration-immediate hover:text-[var(--bellum-text-primary)]"
                    >
                      {label}
                    </button>
                  ) : crumb.to ? (
                    <Link
                      to={crumb.to}
                      className="text-[var(--bellum-text-muted)] transition-colors duration-immediate hover:text-[var(--bellum-text-primary)]"
                    >
                      {label}
                    </Link>
                  ) : (
                    <span className="text-[var(--bellum-text-muted)]">{label}</span>
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      </nav>
      <div className="flex shrink-0 items-center gap-2">
        <GlobalSearchTrigger onOpen={openGlobalSearch} />
        <NavIdentity />
      </div>
    </header>
  )
})

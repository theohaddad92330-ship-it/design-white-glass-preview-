import { Link, useRouterState } from '@tanstack/react-router'
import { Box, cn } from '@bellum/ui'
import { CalendarCheck, Sparkles, Building2, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LauraReadyDot } from '@/features/chat/view/LauraReadyDot'
import { MOBILE_TABS, activeMobileTab } from './mobile-nav'
import { useIsInstalled } from './useIsMobile'

const ICONS: Record<string, typeof Sparkles> = {
  '/chat': Sparkles,
  '/briefing': CalendarCheck,
  '/accounts': Building2,
  '/actions': Zap,
}

/**
 * La barre d'onglets du bas — la navigation de l'appli mobile.
 *
 * En bas et non en haut : c'est la moitié de l'écran qu'un pouce atteint. Une
 * navigation en haut d'un téléphone de 6 pouces se rate une fois sur trois.
 *
 * La barre de sécurité (`env(safe-area-inset-bottom)`) n'est réservée qu'en
 * mode installé : dans un navigateur, la barre d'adresse occupe déjà cette
 * zone, et doubler la marge laisserait un bandeau vide.
 */
export function MobileTabBar() {
  const { t } = useTranslation('mobile')
  const pathname = useRouterState({ select: state => state.location.pathname })
  const active = activeMobileTab(pathname)
  const installed = useIsInstalled()

  return (
    <Box
      as="nav"
      aria-label={t('nav.label')}
      className="border-t border-[var(--bellum-border)] bg-[var(--bg-base)]"
      style={installed ? { paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}
    >
      <Box className="flex">
        {MOBILE_TABS.map(tab => {
          const Icon = ICONS[tab.to] ?? Sparkles
          const isActive = active === tab.to
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={isActive ? 'page' : undefined}
              // 56 px de haut : au-dessus des 44 px recommandés pour une cible
              // tactile, et le libellé reste lisible sous l'icône.
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-14 text-xs',
                isActive ? 'text-[var(--bellum-text-accent)]' : 'text-[var(--bellum-text-muted)]',
              )}
            >
              <span className="relative">
                <Icon className="h-5 w-5" aria-hidden />
                {tab.to === '/chat' ? (
                  <span className="absolute -right-1 -top-1">
                    <LauraReadyDot />
                  </span>
                ) : null}
              </span>
              <span>{t(tab.labelKey)}</span>
            </Link>
          )
        })}
      </Box>
    </Box>
  )
}

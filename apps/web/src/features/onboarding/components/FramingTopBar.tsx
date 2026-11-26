import { useState, type MouseEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Download, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '@bellum/ui'
import { BrandMark } from '@/features/brand/BrandMark'
import { FramingExportDialog } from '@/features/onboarding/components/FramingExportDialog'
import { useTheme } from '@/features/theme/theme-provider'

/**
 * Théo O onboarding-catalogue.N4 — la barre haute des sept écrans d'onboarding
 * V23 : le nom et « Ton contexte de travail » à gauche ; « Exporter », le
 * thème clair/sombre et « Reprendre plus tard » à droite. Les réponses sont
 * déjà enregistrées (brouillon local + serveur) : « Reprendre plus tard » ne
 * fait que quitter, vers Laura où l'on reprendra — sauf sur l'accueil, où le
 * report s'ÉCRIT (`onLater`, #2013.7).
 */
export function FramingTopBar({ onLater, laterBusy = false }: { onLater?: () => void; laterBusy?: boolean }) {
  const { t } = useTranslation('onboarding')
  const { t: tNav } = useTranslation('nav')
  const { resolvedTheme, toggleTheme } = useTheme()
  const [exportOpen, setExportOpen] = useState(false)
  const isDark = resolvedTheme === 'dark'
  const ThemeIcon = isDark ? Sun : Moon
  const later = (
    <>
      <ChevronRight aria-hidden="true" className="mr-1 h-4 w-4" />
      {t('framingBar.later')}
    </>
  )
  return (
    <header
      data-testid="framing-topbar"
      className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 md:px-8"
    >
      <div className="flex min-w-0 items-center gap-4">
        <BrandMark />
        <Text element="span" size="sm" className="hidden text-[var(--bellum-text-muted)] sm:inline">
          {t('framingBar.context')}
        </Text>
      </div>
      <div className="flex items-center gap-1">
        <Button type="button" variant="plain" onClick={() => setExportOpen(true)}>
          <Download aria-hidden="true" className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">{t('framingBar.export')}</span>
          <span className="sr-only sm:hidden">{t('framingBar.export')}</span>
        </Button>
        <Button
          type="button"
          variant="plain"
          size="icon"
          aria-label={isDark ? tNav('theme.toLight') : tNav('theme.toDark')}
          onClick={(e: MouseEvent) => toggleTheme(e)}
        >
          <ThemeIcon aria-hidden="true" className="h-4 w-4" />
        </Button>
        {onLater ? (
          <Button type="button" variant="plain" onClick={onLater} isLoading={laterBusy}>
            {later}
          </Button>
        ) : (
          <Button asChild variant="plain" title={t('framingBar.laterHint')}>
            <Link to="/chat">{later}</Link>
          </Button>
        )}
      </div>
      <FramingExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </header>
  )
}

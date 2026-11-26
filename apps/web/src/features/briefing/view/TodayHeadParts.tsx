import { Box, Button, Text } from '@bellum/ui'
import { Download, MoreHorizontal, RefreshCw, Share2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

export type TodayView = 'activity' | 'agenda'

/**
 * Refonte Théo (A · today-jour) — le bouton « … » de l'en-tête : Actualiser,
 * Exporter, Partager. Trois gestes de LECTURE du brief, rangés hors du premier
 * plan comme dans notre maquette validée (`aujourdhui.html#au-menu`) et chez Théo.
 *
 * Un `<button>` qui ouvre une liste de `<button>` : ce qui se clique se tabule
 * (GA-35), Échap et un clic dehors referment. Rien n'est envoyé — chaque entrée
 * dit ce qu'elle copie (`title`).
 */
export function TodayMoreMenu({
  onRefresh,
  refreshing,
  onExport,
  onShare,
}: {
  onRefresh: () => void
  refreshing: boolean
  onExport: () => void
  onShare: () => void
}) {
  const { t } = useTranslation('briefing')
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onClick = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])
  const item =
    'flex min-h-11 w-full items-center gap-2 rounded-control px-3 text-left text-sm hover:bg-[var(--bellum-surface-2)] disabled:opacity-60'
  return (
    <div ref={root} className="relative">
      <Button
        size="sm"
        variant="ghost"
        className="min-h-11 min-w-11"
        aria-label={t('today.menu.label')}
        aria-expanded={open}
        aria-haspopup="true"
        aria-busy={refreshing}
        onClick={() => setOpen(value => !value)}
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </Button>
      {open ? (
        <Box
          role="group"
          aria-label={t('today.menu.label')}
          className="absolute right-0 top-full z-overlay mt-1 flex w-64 flex-col gap-0.5 rounded-overlay border border-[var(--bellum-border)] bg-card p-1 shadow-overlay"
        >
          <button
            type="button"
            className={item}
            onClick={onRefresh}
            disabled={refreshing}
            title={t('page.refreshDetail')}
            aria-busy={refreshing}
          >
            <RefreshCw className={refreshing ? 'size-3.5 animate-spin' : 'size-3.5'} aria-hidden="true" />
            {t('page.refresh')}
          </button>
          <button
            type="button"
            className={item}
            onClick={() => {
              onExport()
              setOpen(false)
            }}
            title={t('page.export.detail')}
          >
            <Download className="size-3.5" aria-hidden="true" />
            {t('page.export.cta')}
          </button>
          <button
            type="button"
            className={item}
            onClick={() => {
              onShare()
              setOpen(false)
            }}
            title={t('page.share.detail')}
          >
            <Share2 className="size-3.5" aria-hidden="true" />
            {t('page.share.cta')}
          </button>
        </Box>
      ) : null}
    </div>
  )
}

export function TodayUpdatedLine({
  generatedAt,
  timeZone,
  language,
}: {
  generatedAt: string
  timeZone: string
  language: string
}) {
  const { t } = useTranslation('briefing')
  const date = new Date(generatedAt)
  const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', timeZone }).format(date)
  const day = new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(
    date,
  )
  return (
    <Text size="sm" className="text-[var(--bellum-text-secondary)]">
      {t('today.updated', { time, day })}
    </Text>
  )
}

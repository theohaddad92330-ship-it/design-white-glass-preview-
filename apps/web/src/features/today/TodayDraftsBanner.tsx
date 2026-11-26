import { Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Mail } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMyMessageDrafts } from '@/features/mailbox/api'

/**
 * Théo C actions-aujourdhui.N3 / R7 — « N brouillons dans ta messagerie » + « Ouvrir les brouillons ».
 *
 * Il sépare « relire un message » de « terminer une tâche ». Zéro brouillon, ou lecture impossible : aucune ligne
 * (on n'affiche pas ce qu'on n'a pas, et jamais « 0 »).
 */
export function TodayDraftsBanner() {
  const { t } = useTranslation('actions')
  const total = useMyMessageDrafts().data?.total
  if (total === undefined || total <= 0) return null
  return (
    // Refonte Théo (`.a14-model-banner`) — un bandeau d'accent : le compte, la phrase qui sépare
    // les deux gestes, et la porte vers la messagerie.
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] px-5 py-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Text element="h2" size="base" weight="semibold">
          {t('today.drafts.banner', { count: total })}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('today.row.draftsNote')}
        </Text>
      </div>
      <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
        <Link to="/mailbox">
          <Mail className="size-3.5" aria-hidden="true" />
          {t('today.drafts.open')}
        </Link>
      </Button>
    </div>
  )
}

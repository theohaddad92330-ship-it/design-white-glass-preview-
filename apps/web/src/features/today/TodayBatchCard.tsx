import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Loader2, X } from 'lucide-react'
import { Button, Card, Text } from '@bellum/ui'
import type { WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'
import { TodayCard } from './TodayCard'
import type { TodayItem } from './todayQueue'
import type { useTodayGestures } from './useTodayGestures'

/**
 * #4167 (L-D2) — UNE carte pour les écritures CRM déposées ensemble (même `batchId`).
 *
 * « N écritures vers ton CRM », le détail se déplie : chaque écriture y garde sa propre carte, donc sa
 * prévisualisation figée et ses gestes. « Rejeter le lot » refuse tout en un geste (un refus n'écrit
 * rien). Il n'y a PAS d'« Approuver le lot » : une écriture CRM reste derrière sa porte, décidée
 * écriture par écriture sur sa prévisualisation figée — jamais d'écriture en bloc.
 */
export function TodayBatchCard({
  items,
  now,
  gestures,
  members,
  hasMandate,
  onSkip,
}: {
  items: readonly TodayItem[]
  now: Date
  gestures: ReturnType<typeof useTodayGestures>
  members: readonly WorkspaceMember[]
  hasMandate: boolean
  onSkip: (item: TodayItem) => void
}) {
  const { t } = useTranslation('actions')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const detailId = useId()
  const accounts = [...new Set(items.flatMap(item => item.accountName ?? []))]

  const rejectAll = async () => {
    setBusy(true)
    try {
      await gestures.rejectBatch(items)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Text weight="medium">{t('today.batch.title', { count: items.length })}</Text>
          {accounts.length > 0 ? (
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {accounts.join(' · ')}
            </Text>
          ) : null}
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('today.batch.hint')}
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pointer-coarse:min-h-11"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => setOpen(previous => !previous)}
          >
            <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            {open ? t('today.batch.hide') : t('today.batch.show', { count: items.length })}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="pointer-coarse:min-h-11"
            disabled={busy}
            onClick={() => void rejectAll()}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <X className="size-3.5" aria-hidden="true" />
            )}
            {t('today.batch.reject')}
          </Button>
        </div>
      </div>
      {open ? (
        <ul id={detailId} className="space-y-2">
          {items.map(item => (
            <li key={item.id}>
              <TodayCard
                item={item}
                now={now}
                gestures={gestures}
                members={members}
                hasMandate={hasMandate}
                onSkip={onSkip}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}

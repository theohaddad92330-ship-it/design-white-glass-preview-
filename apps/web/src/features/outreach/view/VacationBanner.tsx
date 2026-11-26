import type { OutreachSequence } from '@bellum/contracts'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import type { TFunction } from 'i18next'
import { Palmtree } from 'lucide-react'
import { useState } from 'react'
import { formatDate } from '@/lib/locale'
import { useOutreachResumeVacation, useOutreachStartVacation } from '../hooks/useOutreachMutations'
import { vacationOf } from '../step-channels'

/**
 * Lot L-B (#4165) — LA PAUSE VACANCES. « Mettre toutes mes séquences en pause
 * jusqu'au… » ; à la reprise (date atteinte ou bouton), les échéances restantes
 * sont DÉCALÉES de la durée de la pause — pas de rattrapage en rafale. Le
 * bandeau reste visible tant qu'au moins une séquence est en pause vacances.
 */

/** Aujourd'hui, au format `<input type="date">` (heure locale) — la pause commence au geste. */
function todayInputValue(): string {
  const date = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Demain, au format `<input type="date">` (heure locale) — la plus proche reprise possible. */
function tomorrowInputValue(): string {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function VacationBanner({
  sequences,
  t,
  open,
  onOpenChange,
}: {
  sequences: readonly OutreachSequence[]
  t: TFunction<'outreach'>
  /** Théo C sequences-liste.A6 — le geste « Mode vacances… » vit dans le menu « ⋯ » de l'en-tête, pas ici. */
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const resume = useOutreachResumeVacation()
  const vacation = vacationOf(sequences)

  return (
    <>
      {vacation ? (
        <Box
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--warning-soft-text)] bg-[var(--warning-soft-bg)] px-4 py-3"
          data-testid="vacation-banner"
        >
          <Palmtree className="size-4 shrink-0 text-[var(--warning-soft-text)]" aria-hidden="true" />
          <Box className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Text size="sm" weight="semibold" className="text-[var(--warning-soft-text)]">
              {t('multichannel.vacation.bannerTitle', { date: formatDate(vacation.until) ?? '' })}
            </Text>
            <Text size="sm" className="text-[var(--warning-soft-text)]">
              {t('multichannel.vacation.bannerBody', { count: vacation.count })}
            </Text>
          </Box>
          <Button
            size="sm"
            variant="outline"
            className="pointer-coarse:min-h-11"
            disabled={resume.isPending}
            onClick={() => resume.mutate()}
          >
            {t('multichannel.vacation.resume')}
          </Button>
        </Box>
      ) : null}
      {open ? <VacationDialog onClose={() => onOpenChange(false)} t={t} /> : null}
    </>
  )
}

function VacationDialog({ onClose, t }: { onClose: () => void; t: TFunction<'outreach'> }) {
  const [date, setDate] = useState(tomorrowInputValue())
  const start = useOutreachStartVacation()
  const valid = date >= tomorrowInputValue()

  return (
    <Dialog open onOpenChange={next => !next && onClose()}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('multichannel.vacation.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('multichannel.vacation.dialogDescription')}</DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1 text-sm">
          {t('multichannel.vacation.fromLabel')}
          <input
            type="date"
            value={todayInputValue()}
            readOnly
            disabled
            className="min-h-11 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('multichannel.vacation.untilLabel')}
          <input
            type="date"
            min={tomorrowInputValue()}
            value={date}
            onChange={event => setDate(event.target.value)}
            className="min-h-11 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-2"
          />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            disabled={!valid || start.isPending}
            onClick={() => {
              // Reprise à 07:00 UTC (≈ début de matinée à Paris), comme les échéances.
              start.mutate({ until: new Date(`${date}T07:00:00.000Z`).toISOString() })
              onClose()
            }}
          >
            {t('multichannel.vacation.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

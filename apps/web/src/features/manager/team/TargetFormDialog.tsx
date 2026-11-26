import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import type { UpsertMemberObjective } from '@bellum/contracts'

/**
 * Les cibles d'un mois, sept axes facultatifs (Théo D team-business.N2).
 *
 * Servi par DEUX gestes qui ne se confondent pas :
 *  - `mine`    « Ajuster mes objectifs » — je déclare MA cible, elle est écrite ;
 *  - `propose` « Proposer une cible » — la direction PROPOSE à un membre : la
 *    cible actuelle ne change PAS, le membre répond depuis sa vue.
 *
 * Une case vide = « non défini » (`null`), jamais 0 : une saisie invalide reste
 * `null` plutôt que d'inventer une cible.
 */
type TargetFormMode = 'mine' | 'propose'

type AxisKey = keyof Pick<
  UpsertMemberObjective,
  | 'target_revenue'
  | 'target_meetings'
  | 'target_accounts'
  | 'target_qualified_needs'
  | 'target_placements'
  | 'target_margin_percent'
  | 'target_consultants_on_mission'
>

// i18n keys: team.target.axis.target_revenue | target_meetings | target_accounts | target_qualified_needs |
// target_placements | target_margin_percent | target_consultants_on_mission
const AXES: readonly AxisKey[] = [
  'target_revenue',
  'target_meetings',
  'target_accounts',
  'target_qualified_needs',
  'target_placements',
  'target_margin_percent',
  'target_consultants_on_mission',
]

export type TargetFormValues = Partial<Record<AxisKey, number | null>>

function parseTarget(raw: string, key: AxisKey): number | null {
  const trimmed = raw.trim().replace(/\s/g, '').replace(',', '.')
  if (trimmed === '') return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return null
  if (key === 'target_margin_percent') return value > 0 && value <= 100 ? value : null
  return key === 'target_revenue' ? value : Math.round(value)
}

export function TargetFormDialog({
  mode,
  memberName,
  monthLabel,
  initial,
  pending,
  onSubmit,
  onClose,
}: {
  mode: TargetFormMode
  memberName: string
  monthLabel: string
  initial?: TargetFormValues
  pending: boolean
  onSubmit: (values: TargetFormValues, reason: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation('manager')
  const [raw, setRaw] = useState<Record<AxisKey, string>>(
    () =>
      Object.fromEntries(AXES.map(key => [key, initial?.[key] != null ? String(initial[key]) : ''])) as Record<
        AxisKey,
        string
      >,
  )
  const [reason, setReason] = useState('')

  const submit = () => {
    const values = Object.fromEntries(AXES.map(key => [key, parseTarget(raw[key], key)])) as TargetFormValues
    onSubmit(values, reason)
  }

  return (
    <Dialog open onOpenChange={open => (!open ? onClose() : undefined)}>
      <DialogContent closeLabel={t('team.target.close')} className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'mine' ? t('team.target.titleMine') : t('team.target.titlePropose', { name: memberName })}
          </DialogTitle>
          <DialogDescription>{monthLabel}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {AXES.map(key => (
            <label key={key} className="flex flex-col gap-1">
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t(`team.target.axis.${key}`)}
              </Text>
              <input
                type="number"
                min={0}
                inputMode="decimal"
                value={raw[key]}
                disabled={pending}
                onChange={event => setRaw(prev => ({ ...prev, [key]: event.target.value }))}
                className="min-h-11 w-full rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 text-sm text-[var(--bellum-text-primary)] disabled:opacity-60"
              />
            </label>
          ))}
        </div>
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('team.target.emptyMeansUndefined')}
        </Text>
        {mode === 'propose' ? (
          <>
            <label className="flex flex-col gap-1">
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('team.target.reasonLabel')}
              </Text>
              <textarea
                value={reason}
                maxLength={500}
                disabled={pending}
                onChange={event => setReason(event.target.value)}
                className="min-h-20 w-full rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-2 text-sm text-[var(--bellum-text-primary)]"
              />
            </label>
            <Text size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
              {t('team.target.proposalNoteTitle')}
            </Text>
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('team.target.proposalNote', { name: memberName })}
            </Text>
          </>
        ) : (
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('team.target.mineNote')}
          </Text>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" className="min-h-11" onClick={onClose} disabled={pending}>
            {t('team.target.cancel')}
          </Button>
          <Button type="button" className="min-h-11" onClick={submit} disabled={pending}>
            {mode === 'mine' ? t('team.target.saveMine') : t('team.target.sendProposal')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

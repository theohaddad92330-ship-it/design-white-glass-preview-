import {
  APPROVAL_THRESHOLD_UNBOUNDED,
  WORKSPACE_APPROVAL_POSTURES,
  type ApprovalSettingsView,
  type UpdateApprovalSettings,
} from '@bellum/contracts'
import { Box, Button, Input, Text } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScreenState } from '@/components/primitives/ScreenState'
import { useApprovalSettings, useUpdateApprovalSettings } from '@/features/action-os/hooks/useApprovalSettings'

type ThresholdKey = 'bulkThreshold' | 'spendThreshold'
type Draft = Record<ThresholdKey, { value: string; unbounded: boolean }>

function draftOf(view: ApprovalSettingsView): Draft {
  const one = (value: number) =>
    value === APPROVAL_THRESHOLD_UNBOUNDED ? { value: '', unbounded: true } : { value: String(value), unbounded: false }
  return { bulkThreshold: one(view.bulkThreshold), spendThreshold: one(view.spendThreshold) }
}

/** Un seuil saisi : « sans plafond », un entier ≥ 1, ou `null` quand la saisie est illisible. */
function parseThreshold(entry: Draft[ThresholdKey]): number | null {
  if (entry.unbounded) return APPROVAL_THRESHOLD_UNBOUNDED
  const value = Number(entry.value)
  return Number.isInteger(value) && value >= 1 && value < APPROVAL_THRESHOLD_UNBOUNDED ? value : null
}

/**
 * #4016 L6 — L'AUTONOMIE DE L'ACTION OS, RÉGLÉE PAR L'ADMIN (Louis 11/10/2026).
 *
 * Quatre postures (N2 à N5) et deux seuils — volume et dépense — réglables
 * jusqu'à « sans plafond ». En N4 les seuils bornent ce qui part seul ; en N5,
 * un travail interne part seul sans plafond.
 *
 * La note du bas n'est pas décorative : AUCUNE posture ne fait partir un e-mail
 * ni n'écrit dans le CRM du client sans un go (`levelForStep`, GA-239/GA-375).
 * Un admin qui règle « sans plafond » doit le lire au moment où il le règle.
 */
export function ApprovalSettingsCard() {
  const { t } = useTranslation('routines')
  const query = useApprovalSettings()
  const update = useUpdateApprovalSettings()
  const name = useId()
  const [draft, setDraft] = useState<Draft | null>(null)

  useEffect(() => {
    if (query.data) setDraft(draftOf(query.data))
  }, [query.data])

  if (query.isLoading) return <ScreenState state="loading" message={t('approvalSettings.loading')} />
  if (query.isError || !query.data || !draft) {
    return <ScreenState state="error" message={t('approvalSettings.error')} />
  }

  const view = query.data
  const disabled = !view.canEdit || update.isPending
  const bulk = parseThreshold(draft.bulkThreshold)
  const spend = parseThreshold(draft.spendThreshold)
  const invalid = bulk === null || spend === null

  const save = (body: UpdateApprovalSettings) => {
    if (!update.isPending) update.mutate(body)
  }

  const setEntry = (key: ThresholdKey, patch: Partial<Draft[ThresholdKey]>) =>
    setDraft(current => (current ? { ...current, [key]: { ...current[key], ...patch } } : current))

  return (
    <Box className="mt-6">
      <SettingsBlock label={t('approvalSettings.title')} description={t('approvalSettings.description')}>
        <Box className="flex flex-col gap-4 px-4 py-3">
          <Box role="radiogroup" aria-label={t('approvalSettings.postureLabel')} className="flex flex-col gap-1">
            {WORKSPACE_APPROVAL_POSTURES.map(level => (
              <label
                key={level}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md py-2 has-[:disabled]:cursor-default"
              >
                <input
                  type="radio"
                  name={name}
                  value={level}
                  checked={view.defaultLevel === level}
                  disabled={disabled}
                  onChange={() => save({ defaultLevel: level })}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <Text element="span" size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
                    {t(`approvalSettings.postures.${level}.label`)}
                  </Text>
                  <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]" className="block">
                    {t(`approvalSettings.postures.${level}.hint`)}
                  </Text>
                </span>
              </label>
            ))}
          </Box>

          <form
            className="flex flex-col gap-3"
            onSubmit={event => {
              event.preventDefault()
              if (invalid || !view.canEdit) return
              save({ bulkThreshold: bulk, spendThreshold: spend })
            }}
          >
            {(['bulkThreshold'] as const).map(key => (
              <ThresholdField
                key={key}
                field={key}
                entry={draft[key]}
                disabled={disabled}
                onChange={patch => setEntry(key, patch)}
              />
            ))}
            {invalid ? (
              <Text size="xs" color="text-[var(--danger-soft-text)]">
                {t('approvalSettings.invalid')}
              </Text>
            ) : null}
            {view.canEdit ? (
              <Box>
                <Button type="submit" size="sm" disabled={invalid || disabled} className="pointer-coarse:min-h-11">
                  {t('approvalSettings.saveThresholds')}
                </Button>
              </Box>
            ) : (
              <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                {t('approvalSettings.readOnly')}
              </Text>
            )}
          </form>

          <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
            {t('approvalSettings.neverWithoutGo')}
          </Text>
        </Box>
      </SettingsBlock>
    </Box>
  )
}

function ThresholdField({
  field,
  entry,
  disabled,
  onChange,
}: {
  field: ThresholdKey
  entry: Draft[ThresholdKey]
  disabled: boolean
  onChange: (patch: Partial<Draft[ThresholdKey]>) => void
}) {
  const { t } = useTranslation('routines')
  const inputId = useId()
  return (
    <Box className="flex flex-wrap items-center gap-3">
      <label htmlFor={inputId} className="min-w-0">
        <Text element="span" size="sm" color="text-[var(--bellum-text-primary)]">
          {t(`approvalSettings.${field}.label`)}
        </Text>
      </label>
      <Input
        id={inputId}
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={entry.unbounded ? '' : entry.value}
        disabled={disabled || entry.unbounded}
        placeholder={entry.unbounded ? t('approvalSettings.unbounded') : undefined}
        onChange={event => onChange({ value: event.target.value })}
        className="w-28 pointer-coarse:min-h-11"
      />
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={entry.unbounded}
          disabled={disabled}
          aria-label={t(`approvalSettings.${field}.unboundedLabel`)}
          onChange={event => onChange({ unbounded: event.target.checked })}
        />
        <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('approvalSettings.unbounded')}
        </Text>
      </label>
    </Box>
  )
}

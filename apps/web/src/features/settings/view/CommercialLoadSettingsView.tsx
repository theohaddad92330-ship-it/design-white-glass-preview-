import {
  COMMERCIAL_LOAD_BOUNDS,
  hasPermission,
  MAX_OPEN_NEEDS_BOUNDS,
  SEND_TIMING_WEEKDAYS,
  WEEKLY_AVAILABLE_HOURS_BOUNDS,
} from '@bellum/contracts'
import { Box, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Text } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScreenState } from '@/components/primitives/ScreenState'
import { MeasuredValue, UnknownValue } from '@/components/primitives/UnknownValue'
import { useTeam } from '@/features/team/hooks/useTeam'
import { useCommercialLoadSettings } from '../hooks/useCommercialLoadSettings'
import { SettingsViewHeader } from '@/features/settings/components/SettingsViewHeader'

/**
 * `#2035.11` — LA CHARGE COMMERCIALE ET LA PRIORISATION DES BESOINS.
 *
 * Mesuré le 18/09/2026 : rien n'existait, ni côté IA ni côté produit. Ce que
 * le modèle de données porte réellement, et sur quoi ces deux plafonds
 * s'appuient : `accounts.assigned_to` (le commercial qui suit un dossier) et
 * `project_needs.status` (un besoin est ouvert tant que son état n'est pas
 * `staffed`/`lost`/`cancelled`). Aucun autre concept n'est inventé ici — pas
 * de score de priorité, pas de pondération : ce que la table ne porte pas ne
 * se règle pas sur cet écran.
 *
 * ⚠️ #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes.
 * Deux vagues du 21/09/2026 ont livré DEUX écrans qui réglaient tous les deux
 * le plafond de besoins ouverts : celui-ci et « Réglages › Priorisation
 * commerciale ». Un seul écran par sujet : cet écran porte les deux plafonds de
 * la charge commerciale, l'autre a disparu (GA-26).
 *
 * `maxOpenNeeds` n'est PAS nullable — la colonne de production est
 * `NOT NULL DEFAULT 15` et `OpenNeedsService` s'en sert pour reprioriser : il a
 * toujours une valeur, donc pas de « non renseigné » ni de remise à zéro sur
 * cette ligne, contrairement aux dossiers suivis.
 *
 * Lecture ouverte à tout membre ; écriture réservée à `team:manage`, comme le
 * marché inversé juste à côté.
 */
export function CommercialLoadSettingsView() {
  const { t } = useTranslation('commercialLoadSettings')
  const { team, isLoading: teamLoading } = useTeam()
  const role = team?.workspace.role
  const canEdit = role ? hasPermission(role, 'team:manage') : false

  const settings = useCommercialLoadSettings()

  return (
    <Box className="w-full">
      <SettingsViewHeader scope="space" title={t('title')} subtitle={t('subtitle')} />

      {teamLoading || settings.isLoading ? (
        <ScreenState state="loading" message={t('loadingMessage')} />
      ) : settings.isError ? (
        <ScreenState state="error" message={t('errorMessage')} />
      ) : (
        <SettingsBlock label={t('groupLabel')}>
          <LoadCapRow
            fieldKey="maxTrackedAccounts"
            bounds={COMMERCIAL_LOAD_BOUNDS}
            value={settings.maxTrackedAccounts}
            canEdit={canEdit}
            saving={settings.saving}
            onSave={value => settings.save({ maxTrackedAccounts: value })}
          />
          {/* #3245 (reste de #3209.3) — première pièce du budget d'effort réel :
              un réglage vit à un seul endroit (GA-26), il rejoint les deux
              plafonds déjà déclarés sur cet écran plutôt qu'un écran neuf. */}
          <LoadCapRow
            fieldKey="weeklyAvailableHours"
            bounds={WEEKLY_AVAILABLE_HOURS_BOUNDS}
            value={settings.weeklyAvailableHours}
            canEdit={canEdit}
            saving={settings.saving}
            onSave={value => settings.save({ weeklyAvailableHours: value })}
          />
          <OpenNeedsRow
            value={settings.maxOpenNeeds}
            canEdit={canEdit}
            saving={settings.saving}
            onSave={value => settings.save({ maxOpenNeeds: value })}
          />
          {/* #3289.29 — les préférences de cadence rejoignent cet écran (GA-26), pas un écran neuf. */}
          <CadenceWeekdayRow
            value={settings.cadenceWeekday}
            canEdit={canEdit}
            saving={settings.saving}
            onSave={value => settings.save({ cadenceWeekday: value })}
          />
        </SettingsBlock>
      )}
    </Box>
  )
}

function LoadCapRow({
  fieldKey,
  bounds,
  value,
  canEdit,
  saving,
  onSave,
}: {
  // Les deux plafonds NULLABLE du sujet : les besoins ouverts ont leur propre
  // ligne (`OpenNeedsRow`), sans « non renseigné » possible.
  fieldKey: 'maxTrackedAccounts' | 'weeklyAvailableHours'
  bounds: { min: number; max: number }
  value: number | null
  canEdit: boolean
  saving: boolean
  onSave: (value: number | null) => void
}) {
  const { t } = useTranslation('commercialLoadSettings')
  const inputId = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const label = t(`${fieldKey}.label`)

  useEffect(() => {
    setDraft(null)
  }, [value])

  const current = draft ?? (value === null ? '' : String(value))
  const trimmed = current.trim()
  const parsed = trimmed === '' ? null : Number.parseInt(trimmed, 10)
  const invalid = parsed !== null && (!Number.isFinite(parsed) || parsed < bounds.min || parsed > bounds.max)

  return (
    <Box
      display="flex"
      className="flex-col gap-2 border-t border-[var(--bellum-border)] px-4 py-3 first:border-t-0 sm:flex-row sm:items-start sm:justify-between"
    >
      <Box className="min-w-0">
        <Text size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
          {label}
        </Text>
        {/* GA-18/GA-19 — un plafond non déclaré n'est jamais « 0 dossier ». */}
        {value === null ? (
          <UnknownValue reason={t(`${fieldKey}.unset`)} />
        ) : (
          <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
            <MeasuredValue value={value} format={v => t(`${fieldKey}.value`, { count: v })} />
          </Text>
        )}
      </Box>

      {canEdit ? (
        <form
          className="flex flex-wrap items-start gap-2"
          onSubmit={event => {
            event.preventDefault()
            if (invalid) return
            onSave(parsed)
          }}
        >
          <Box className="flex flex-col gap-1">
            <Input
              id={inputId}
              type="number"
              inputMode="numeric"
              min={bounds.min}
              max={bounds.max}
              value={current}
              aria-label={label}
              aria-invalid={invalid}
              onChange={event => setDraft(event.target.value)}
              className="w-28 pointer-coarse:min-h-11"
              placeholder={t('placeholder')}
            />
            {invalid ? (
              <Text size="xs" color="text-[var(--danger-soft-text)]">
                {t(`${fieldKey}.invalid`, bounds)}
              </Text>
            ) : null}
          </Box>
          <Button type="submit" size="sm" disabled={invalid || saving} className="pointer-coarse:min-h-11">
            {t('save')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={value === null || saving}
            className="pointer-coarse:min-h-11"
            onClick={() => onSave(null)}
          >
            {t('reset')}
          </Button>
        </form>
      ) : null}
    </Box>
  )
}

/**
 * Le plafond de besoins ouverts — la colonne de production, `NOT NULL DEFAULT 15`.
 * Il a toujours une valeur, donc aucune ligne « non renseigné » et aucun bouton
 * de remise à zéro : ce serait proposer un état que la base refuse.
 */
function OpenNeedsRow({
  value,
  canEdit,
  saving,
  onSave,
}: {
  value: number
  canEdit: boolean
  saving: boolean
  onSave: (value: number) => void
}) {
  const { t } = useTranslation('commercialLoadSettings')
  const inputId = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const label = t('maxOpenNeeds.label')

  useEffect(() => {
    setDraft(null)
  }, [value])

  const current = draft ?? String(value)
  const trimmed = current.trim()
  const parsed = trimmed === '' ? null : Number.parseInt(trimmed, 10)
  const invalid =
    parsed === null ||
    !Number.isFinite(parsed) ||
    parsed < MAX_OPEN_NEEDS_BOUNDS.min ||
    parsed > MAX_OPEN_NEEDS_BOUNDS.max

  return (
    <Box
      display="flex"
      className="flex-col gap-2 border-t border-[var(--bellum-border)] px-4 py-3 first:border-t-0 sm:flex-row sm:items-start sm:justify-between"
    >
      <Box className="min-w-0">
        <Text size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
          {label}
        </Text>
        <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
          <MeasuredValue value={value} format={v => t('maxOpenNeeds.value', { count: v })} />
        </Text>
      </Box>

      {canEdit ? (
        <form
          className="flex flex-wrap items-start gap-2"
          onSubmit={event => {
            event.preventDefault()
            if (invalid || parsed === null) return
            onSave(parsed)
          }}
        >
          <Box className="flex flex-col gap-1">
            <Input
              id={inputId}
              type="number"
              inputMode="numeric"
              min={MAX_OPEN_NEEDS_BOUNDS.min}
              max={MAX_OPEN_NEEDS_BOUNDS.max}
              step="1"
              value={current}
              aria-label={label}
              aria-invalid={invalid}
              onChange={event => setDraft(event.target.value)}
              className="w-28 pointer-coarse:min-h-11"
            />
            {invalid ? (
              <Text size="xs" color="text-[var(--danger-soft-text)]">
                {t('maxOpenNeeds.invalid', MAX_OPEN_NEEDS_BOUNDS)}
              </Text>
            ) : null}
          </Box>
          <Button type="submit" size="sm" disabled={invalid || saving} className="pointer-coarse:min-h-11">
            {t('save')}
          </Button>
        </form>
      ) : null}
    </Box>
  )
}

// Radix refuse une valeur vide : « aucun jour imposé » porte une clé nommée.
const NO_WEEKDAY = 'none'

/** #3289.29 — le jour imposé aux relances de cadence : « aucun jour imposé » est un choix, pas un 0. */
function CadenceWeekdayRow({
  value,
  canEdit,
  saving,
  onSave,
}: {
  value: (typeof SEND_TIMING_WEEKDAYS)[number] | null
  canEdit: boolean
  saving: boolean
  onSave: (value: (typeof SEND_TIMING_WEEKDAYS)[number] | null) => void
}) {
  const { t } = useTranslation('commercialLoadSettings')
  const selectId = useId()
  const label = t('cadenceWeekday.label')

  return (
    <Box
      display="flex"
      className="flex-col gap-2 border-t border-[var(--bellum-border)] px-4 py-3 first:border-t-0 sm:flex-row sm:items-start sm:justify-between"
    >
      <Box className="min-w-0">
        <Text size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
          {label}
        </Text>
        <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('cadenceWeekday.hint')}
        </Text>
      </Box>
      <Select
        value={value ?? NO_WEEKDAY}
        disabled={!canEdit || saving}
        onValueChange={next => onSave(SEND_TIMING_WEEKDAYS.find(weekday => weekday === next) ?? null)}
      >
        <SelectTrigger id={selectId} aria-label={label} className="w-48 pointer-coarse:min-h-11">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_WEEKDAY}>{t('cadenceWeekday.none')}</SelectItem>
          {SEND_TIMING_WEEKDAYS.map(weekday => (
            <SelectItem key={weekday} value={weekday}>
              {t(`cadenceWeekday.${weekday}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Box>
  )
}

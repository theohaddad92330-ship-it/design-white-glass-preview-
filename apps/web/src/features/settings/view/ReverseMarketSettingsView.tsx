import { hasPermission, MAX_RECRUITERS_SHOWN_BOUNDS, REVERSE_MARKET_RESPONSE_CAPACITY_BOUNDS } from '@bellum/contracts'
import { Box, Button, Input, SettingsRow, Switch, Text } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScreenState } from '@/components/primitives/ScreenState'
import { MeasuredValue, UnknownValue } from '@/components/primitives/UnknownValue'
import { useTeam } from '@/features/team/hooks/useTeam'
import { useReverseMarketSettings } from '../hooks/useReverseMarketSettings'
import { SettingsViewHeader } from '@/features/settings/components/SettingsViewHeader'

/**
 * `#2035.10` — LE MARCHÉ INVERSÉ : UN SEUL ÉCRAN POUR TOUT LE SUJET.
 *
 * Mesuré le 18/09/2026 : la lecture du marché inversé existe déjà
 * (`ReverseMarketPage.tsx`, un affichage de rapprochement par consultant) mais
 * AUCUN écran ne permet de le régler par espace.
 *
 * ⚠️ #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes.
 * Deux vagues du 21/09/2026 ont livré DEUX écrans pour ce sujet : celui-ci
 * (activation, capacité de réponse) et « Réglages › Priorisation commerciale »
 * (nombre de recruteurs affichés, mêlé à la charge commerciale). Un seul écran
 * par sujet : le nombre de recruteurs a REJOINT cet écran, et l'autre a
 * disparu. Un réglage vit à un seul endroit (GA-26).
 *
 * 🔴 LA LIGNE ROUGE : la capacité de réponse nomme ce que l'espace ACCEPTE DE
 * TRAITER — un entier posé par un administrateur — jamais une chance
 * estimée. Aucune PROBABILITÉ ne s'affiche dans ce produit (refusé six fois).
 *
 * Lecture ouverte à tout membre (`GET` non gardé côté serveur) ; écriture
 * réservée à `team:manage`, le rôle d'administration de l'espace — comme le
 * SLA du pipe et le seuil de marge.
 */
export function ReverseMarketSettingsView() {
  const { t } = useTranslation('reverseMarketSettings')
  const { team, isLoading: teamLoading } = useTeam()
  const role = team?.workspace.role
  const canEdit = role ? hasPermission(role, 'team:manage') : false

  const settings = useReverseMarketSettings()

  return (
    <Box className="w-full">
      <SettingsViewHeader scope="space" title={t('title')} subtitle={t('subtitle')} />

      {teamLoading || settings.isLoading ? (
        <ScreenState state="loading" message={t('loadingMessage')} />
      ) : settings.isError ? (
        <ScreenState state="error" message={t('errorMessage')} />
      ) : (
        <SettingsBlock label={t('groupLabel')}>
          <SettingsRow
            title={t('enabledLabel')}
            description={t('enabledDescription')}
            trailing={
              canEdit ? (
                <Switch
                  aria-label={t('enabledLabel')}
                  checked={settings.enabled}
                  disabled={settings.saving}
                  onCheckedChange={checked => settings.save({ enabled: checked })}
                />
              ) : (
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {settings.enabled ? t('enabledYes') : t('enabledNo')}
                </Text>
              )
            }
          />
          <CapacityRow
            value={settings.responseCapacityPerWeek}
            canEdit={canEdit}
            saving={settings.saving}
            onSave={value => settings.save({ responseCapacityPerWeek: value })}
          />
          {/* Venu de « Priorisation commerciale » à la fusion du 21/09 : le
              nombre de recruteurs que « Marché externe » remonte par
              consultant appartient à CE sujet, pas à la charge commerciale. */}
          <RecruitersShownRow
            value={settings.maxRecruitersShown}
            canEdit={canEdit}
            saving={settings.saving}
            onSave={value => settings.save({ maxRecruitersShown: value })}
          />
        </SettingsBlock>
      )}
    </Box>
  )
}

function CapacityRow({
  value,
  canEdit,
  saving,
  onSave,
}: {
  value: number | null
  canEdit: boolean
  saving: boolean
  onSave: (value: number | null) => void
}) {
  const { t } = useTranslation('reverseMarketSettings')
  const inputId = useId()
  const [draft, setDraft] = useState<string | null>(null)

  useEffect(() => {
    setDraft(null)
  }, [value])

  const current = draft ?? (value === null ? '' : String(value))
  const trimmed = current.trim()
  const parsed = trimmed === '' ? null : Number.parseInt(trimmed, 10)
  const invalid =
    parsed !== null &&
    (!Number.isFinite(parsed) ||
      parsed < REVERSE_MARKET_RESPONSE_CAPACITY_BOUNDS.min ||
      parsed > REVERSE_MARKET_RESPONSE_CAPACITY_BOUNDS.max)

  return (
    <Box
      display="flex"
      className="flex-col gap-2 border-t border-[var(--bellum-border)] px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <Box className="min-w-0">
        <Text size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
          {t('capacityLabel')}
        </Text>
        {/* GA-18/GA-19 — une capacité non déclarée n'est jamais « 0 ». */}
        {value === null ? (
          <UnknownValue reason={t('capacityUnset')} />
        ) : (
          <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
            <MeasuredValue value={value} format={v => t('capacityValue', { count: v })} />
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
              min={REVERSE_MARKET_RESPONSE_CAPACITY_BOUNDS.min}
              max={REVERSE_MARKET_RESPONSE_CAPACITY_BOUNDS.max}
              value={current}
              aria-label={t('capacityLabel')}
              aria-invalid={invalid}
              onChange={event => setDraft(event.target.value)}
              className="w-28 pointer-coarse:min-h-11"
              placeholder={t('capacityPlaceholder')}
            />
            {invalid ? (
              <Text size="xs" color="text-[var(--danger-soft-text)]">
                {t('invalid')}
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
 * Le nombre de recruteurs remontés par consultant — le réglage que la vague 2
 * avait mis sur un autre écran. Il n'est PAS nullable : il y a toujours un
 * nombre de lignes à afficher, donc ni « non renseigné » ni bouton de remise à
 * zéro ici, contrairement à la capacité juste au-dessus.
 */
function RecruitersShownRow({
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
  const { t } = useTranslation('reverseMarketSettings')
  const inputId = useId()
  const [draft, setDraft] = useState<string | null>(null)

  useEffect(() => {
    setDraft(null)
  }, [value])

  const current = draft ?? String(value)
  const trimmed = current.trim()
  const parsed = trimmed === '' ? null : Number.parseInt(trimmed, 10)
  const invalid =
    parsed === null ||
    !Number.isFinite(parsed) ||
    parsed < MAX_RECRUITERS_SHOWN_BOUNDS.min ||
    parsed > MAX_RECRUITERS_SHOWN_BOUNDS.max

  return (
    <Box
      display="flex"
      className="flex-col gap-2 border-t border-[var(--bellum-border)] px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <Box className="min-w-0">
        <Text size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
          {t('recruitersShownLabel')}
        </Text>
        <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
          <MeasuredValue value={value} format={v => t('recruitersShownValue', { count: v })} />
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
              min={MAX_RECRUITERS_SHOWN_BOUNDS.min}
              max={MAX_RECRUITERS_SHOWN_BOUNDS.max}
              step="1"
              value={current}
              aria-label={t('recruitersShownLabel')}
              aria-invalid={invalid}
              onChange={event => setDraft(event.target.value)}
              className="w-28 pointer-coarse:min-h-11"
            />
            {invalid ? (
              <Text size="xs" color="text-[var(--danger-soft-text)]">
                {t('recruitersShownInvalid', MAX_RECRUITERS_SHOWN_BOUNDS)}
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

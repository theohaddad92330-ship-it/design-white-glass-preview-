import { hasPermission } from '@bellum/contracts'
import { Box, Button, Input, Text } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScreenState } from '@/components/primitives/ScreenState'
import { MeasuredValue, UnknownValue } from '@/components/primitives/UnknownValue'
import { useTeam } from '@/features/team/hooks/useTeam'
import { useMarginThreshold } from '../hooks/useMarginThreshold'
import { SettingsViewHeader } from '@/features/settings/components/SettingsViewHeader'

/**
 * #2420.17 — LE SEUIL D'ALERTE DE MARGE, ENFIN RÉGLABLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MESURÉ LE 17/09/2026 AU SOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * `PATCH delivery/finance/margin-threshold` (`finance.controller.ts`) existait,
 * gardé (`finance:write`), testé — et n'avait AUCUN appelant dans `apps/web`
 * (`git grep` vide). Sur `/pilotage/finance`, « Seuil d'alerte · non réglé »
 * était donc en LECTURE SEULE chez tous les clients : `diagnose()` rendait
 * toujours `null` côté moteur (`mission-margin-engine.ts`), et le « diagnostic
 * de Laura » sur une marge basse ne s'affichait nulle part. Du code juste,
 * calculé, testé, que personne n'appelait — la famille n°1 du dépôt.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN SEUL ENDROIT, DEUX ROUTES EXISTANTES (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce formulaire n'invente ni route ni calcul : il lit `GET
 * /delivery/finance/margin` (la MÊME lecture que `/pilotage/finance`) et écrit
 * par `PATCH /delivery/finance/margin-threshold`. Le seuil vit dans
 * `workspaces.margin_alert_threshold_percent`, à UN seul endroit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PERMISSION — REPRISE, PAS INVENTÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * Exactement la même que celle qui garde déjà la route côté API :
 * `finance:write` pour RÉGLER. Un membre qui peut LIRE la finance
 * (`finance:read` ou `finance:read:own`, comme `GET margin` l'accepte déjà)
 * mais pas régler voit la valeur, jamais un formulaire qui rendrait 403. Un
 * membre sans aucun des deux droits voit un refus NOMMÉ, jamais l'écran brut
 * d'une erreur serveur.
 */
export function FinanceSettingsView() {
  const { t } = useTranslation('financeSettings')
  const { team, isLoading: teamLoading } = useTeam()
  const role = team?.workspace.role
  const canRead = role ? hasPermission(role, 'finance:read') || hasPermission(role, 'finance:read:own') : false
  const canEdit = role ? hasPermission(role, 'finance:write') : false

  const threshold = useMarginThreshold(canRead)

  return (
    <Box className="w-full">
      <SettingsViewHeader scope="space" title={t('title')} subtitle={t('subtitle')} />

      {teamLoading ? (
        <ScreenState state="loading" message={t('loadingMessage')} />
      ) : !canRead ? (
        <ScreenState state="permission" title={t('accessDenied.title')} message={t('accessDenied.message')} />
      ) : threshold.isLoading ? (
        <ScreenState state="loading" message={t('loadingMessage')} />
      ) : threshold.isError ? (
        <ScreenState state="error" message={t('errorMessage')} />
      ) : (
        <SettingsBlock label={t('groupLabel')} description={t('subtitle')}>
          <MarginThresholdRow
            value={threshold.threshold}
            canEdit={canEdit}
            saving={threshold.saving}
            onSave={threshold.save}
          />
        </SettingsBlock>
      )}
    </Box>
  )
}

function MarginThresholdRow({
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
  const { t } = useTranslation('financeSettings')
  const inputId = useId()
  const [draft, setDraft] = useState<string | null>(null)

  // La valeur en cours change (rechargement, ou après un enregistrement) :
  // le brouillon local doit s'effacer pour la suivre, sinon un « 15 » resterait
  // affiché après un « Remettre à non réglé ».
  useEffect(() => {
    setDraft(null)
  }, [value])

  const current = draft ?? (value === null ? '' : String(value))
  const trimmed = current.trim()
  const parsed = trimmed === '' ? null : Number(trimmed.replace(',', '.'))
  const invalid = parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 100)

  return (
    <Box display="flex" className="flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <Box className="min-w-0">
        <Text size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
          {t('fieldLabel')}
        </Text>
        {/* #2420.17 — « non réglé » reste un inconnu NOMMÉ : jamais `0`, jamais
            un défaut inventé. Un seuil absent n'allume aucune alerte, et le dit. */}
        {value === null ? (
          <UnknownValue reason={t('notSet')} />
        ) : (
          <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
            <MeasuredValue value={value} format={v => t('currentValue', { value: v })} />
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
              inputMode="decimal"
              min={0}
              max={100}
              step="0.1"
              value={current}
              aria-label={t('fieldLabel')}
              aria-invalid={invalid}
              onChange={event => setDraft(event.target.value)}
              className="w-28 pointer-coarse:min-h-11"
              placeholder={t('notSetPlaceholder')}
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
      ) : (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('readOnlyNote')}
        </Text>
      )}
    </Box>
  )
}

import type { AutomationVersionDifference } from '@bellum/contracts'
import { Box, Spinner, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useAutomationSwitchPreview } from '../api'
import { THEO_CARD, THEO_EYEBROW } from './theo-classes'

/**
 * #2399.7 — ce que la bascule montre AVANT de basculer : l'ancienne et la nouvelle version par leur numéro, ce qui change
 * champ par champ (et seulement ce qui change), ce qu'il advient de ce qui est déjà en cours, et l'impact — mesuré en
 * LECTURE SEULE. Un impact qu'on n'a pas pu mesurer se dit, il n'est jamais « 0 » (GA-18 / GA-19), et la bascule reste possible.
 *
 * Elle vit là où la bascule se fait (l'éditeur), pas sur une page à part : ouvrir la comparaison est ce qui la marque rendue
 * côté serveur, et la bascule l'exige.
 */
export function AutomationSwitchPreview({ ruleId }: { ruleId: string }) {
  const { t } = useTranslation('routines')
  const query = useAutomationSwitchPreview(ruleId, true)

  if (query.isLoading) {
    return (
      <Box className={`${THEO_CARD} mt-4 flex items-center gap-2`}>
        <Spinner />
        <Text size="sm">{t('editor.switch.loading')}</Text>
      </Box>
    )
  }
  const preview = query.data
  if (query.isError || !preview) {
    return (
      <Box role="alert" className={`${THEO_CARD} mt-4`}>
        <Text size="sm">{t('editor.switch.error')}</Text>
      </Box>
    )
  }

  const valueOf = (difference: AutomationVersionDifference, value: string | number | null): string => {
    if (value === null) return t('editor.switch.none')
    if (typeof value === 'number') {
      return difference.field === 'inactive_days' ? t('editor.switch.days', { count: value }) : String(value)
    }
    if (difference.field === 'signal') return t(`actions:automations.signal.${value}`, { days: '' })
    if (difference.field === 'action_kind') return t(`editor.switch.value.${value}`, { defaultValue: value })
    if (difference.field === 'prepared_action') return t(`editor.result.${value}`, { defaultValue: value })
    return value
  }

  const { migration, impact } = preview
  // #2843.19/.21 — Louis 31/10/2026 (c132, crédits implicites) : le plafond d'usage est BACK-OFFICE seul,
  // son libellé client est retiré ; un changement de plafond ne s'affiche donc pas ici.
  const differences = preview.differences.filter(difference => difference.field !== 'credit_cap')
  return (
    <section className={`${THEO_CARD} mt-4`} aria-label={t('editor.switch.title')}>
      <Text className={THEO_EYEBROW}>{t('editor.switch.title')}</Text>
      <Box className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
        <Text size="sm" className="font-semibold">
          {t('editor.switch.from', { version: preview.from_version })}
        </Text>
        <Text size="sm" className="font-semibold">
          {t('editor.switch.to', { version: preview.to_version })}
        </Text>
      </Box>

      <Text className={`${THEO_EYEBROW} mt-4`}>{t('editor.switch.differencesTitle')}</Text>
      {differences.length === 0 ? (
        <Text size="sm" className="mt-1">
          {t('editor.switch.noDifferences')}
        </Text>
      ) : (
        <ul className="mt-1 space-y-1">
          {differences.map(difference => (
            <li key={difference.field} className="flex flex-wrap gap-x-2 text-sm">
              <span className="font-semibold">{t(`editor.switch.field.${difference.field}`)}</span>
              <span>
                {t('editor.switch.change', {
                  before: valueOf(difference, difference.before),
                  after: valueOf(difference, difference.after),
                  interpolation: { escapeValue: false },
                })}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Text className={`${THEO_EYEBROW} mt-4`}>{t('editor.switch.migrationTitle')}</Text>
      <Text size="sm" className="mt-1">
        {migration.engaged_firings === 0
          ? t('editor.switch.migrationNone')
          : t('editor.switch.migrationEngaged', { count: migration.engaged_firings })}
      </Text>
      {migration.signal_changes ? (
        <Text size="sm" className="mt-1">
          {t('editor.switch.migrationSignal', { from: preview.from_version, to: preview.to_version })}
        </Text>
      ) : null}

      <Text className={`${THEO_EYEBROW} mt-4`}>{t('editor.switch.impactTitle')}</Text>
      <Text size="sm" className="mt-1">
        {impact.measured
          ? t('editor.switch.impactMeasured', {
              count: impact.would_act,
              read: impact.situations_read,
              version: preview.to_version,
            })
          : t('editor.switch.impactUnmeasured')}
      </Text>
      <Text size="xs" className="mt-3 text-[var(--bellum-text-muted)]">
        {t('editor.switch.kept', { version: preview.from_version })}
      </Text>
    </section>
  )
}

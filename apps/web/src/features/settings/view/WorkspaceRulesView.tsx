import type {
  BusinessUnitAccountsVisibility,
  UpdateWorkspaceRules,
  WorkspaceExportPolicy,
  WorkspaceRulesView as Rules,
} from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { WorkspaceProfileSetting } from './WorkspaceProfileSetting'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { ScreenState } from '@/components/primitives/ScreenState'
import { formatDate } from '@/lib/locale'
import { useWorkspaceRules } from '../hooks/useWorkspaceRules'
import { SettingsViewHeader } from '@/features/settings/components/SettingsViewHeader'

/**
 * #2081.14 — RÉGLAGES › RÈGLES D'ESPACE (DÉCISION Louis 19/09/2026).
 *
 * Le SEUL endroit où l'on pose une règle d'espace (GA-26). Deux règles, posées
 * par un administrateur pour tout l'espace, qui PRIMENT sur les réglages de
 * chacun : la visibilité des comptes d'une unité, et qui peut exporter.
 *
 * ⚠️ Cet écran ne décide RIEN. Ce qu'une règle retire est lu par l'API à
 * l'endroit qui décide (le guard d'export, le périmètre des comptes) ; ici on
 * lit, on montre la trace (qui, quand), et on propose le changement à qui
 * l'API dit pouvoir le faire (`canEdit`). Tout membre LIT les règles : qui se
 * voit refuser un export doit pouvoir lire pourquoi.
 */
export function WorkspaceRulesView() {
  const { t } = useTranslation('workspaceRules')
  const { rules, isLoading, isError, update, saving } = useWorkspaceRules()

  return (
    <Box className="w-full">
      <SettingsViewHeader scope="space" title={t('title')} subtitle={t('subtitle')} />

      {isLoading ? (
        <ScreenState state="loading" message={t('loadingMessage')} />
      ) : isError || !rules ? (
        <ScreenState state="error" message={t('errorMessage')} />
      ) : (
        <Box display="flex" className="flex-col gap-4">
          {rules.canEdit ? null : (
            <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('readOnlyNote')}
            </Text>
          )}
          <RuleGroup<BusinessUnitAccountsVisibility>
            ruleKey="visibility"
            options={['shared', 'private']}
            rule={rules.businessUnitAccountsVisibility}
            disabled={!rules.canEdit || saving}
            onChange={value => update({ businessUnitAccountsVisibility: value } satisfies UpdateWorkspaceRules)}
          />
          <RuleGroup<WorkspaceExportPolicy>
            ruleKey="export"
            options={['everyone', 'admins']}
            rule={rules.exportPolicy}
            disabled={!rules.canEdit || saving}
            onChange={value => update({ exportPolicy: value } satisfies UpdateWorkspaceRules)}
          />
          {/* #4291.5 — le profil d'espace « forfait / conseil » : un réglage d'espace, un seul endroit. */}
          <WorkspaceProfileSetting canEdit={rules.canEdit} />
        </Box>
      )}
    </Box>
  )
}

function RuleGroup<Value extends string>({
  ruleKey,
  options,
  rule,
  disabled,
  onChange,
}: {
  ruleKey: 'visibility' | 'export'
  options: readonly Value[]
  rule: Omit<Rules['exportPolicy'], 'value'> & { value: Value }
  disabled: boolean
  onChange: (value: Value) => void
}) {
  const { t } = useTranslation('workspaceRules')
  const name = useId()
  const date = formatDate(rule.changedAt, { dateStyle: 'long' })

  return (
    <SettingsBlock label={t(`${ruleKey}.label`)} description={t(`${ruleKey}.description`)}>
      <Box role="radiogroup" aria-label={t(`${ruleKey}.label`)} className="flex flex-col gap-1 px-4 py-3">
        {options.map(option => (
          <label
            key={option}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md py-2 has-[:disabled]:cursor-default"
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={rule.value === option}
              disabled={disabled}
              onChange={() => onChange(option)}
              className="mt-1"
            />
            <span className="min-w-0">
              <Text element="span" size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
                {t(`${ruleKey}.${option}`)}
              </Text>
              <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]" className="block">
                {t(`${ruleKey}.${option}Hint`)}
              </Text>
            </span>
          </label>
        ))}
        {/* La TRACE : qui a changé la règle, et quand. `null` = jamais changée —
            c'est la valeur par défaut, et l'écran le dit plutôt que de taire. */}
        <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1">
          {date === null
            ? t('neverChanged')
            : rule.changedByName
              ? t('changedBy', { name: rule.changedByName, date })
              : t('changedByUnknown', { date })}
        </Text>
      </Box>
    </SettingsBlock>
  )
}

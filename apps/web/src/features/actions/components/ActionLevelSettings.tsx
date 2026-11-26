import { SETTABLE_ACTION_LEVELS, type SettableActionLevel } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { Link } from '@tanstack/react-router'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { ScreenState } from '@/components/primitives/ScreenState'
import { useActionLevel, useSetActionLevel } from '@/features/actions/hooks/useActionLevel'

/** « Aucun réglage » — jamais écrit : le choisir RETIRE la clé (`level: null`). */
const DEFAULT_CHOICE = 'default'

/**
 * #2896 / #2449.34 — LE NIVEAU D'ACTION, DANS LES PARAMÈTRES DU TRAVAIL.
 *
 * Réglages › Laura, sous le mode par défaut : c'est l'écran qui dit comment
 * Laura part. Le niveau est PERSONNEL (le sac `user_preferences`), donc tout
 * membre règle le sien — à la différence du mode par défaut, qui est une valeur
 * d'espace réservée aux administrateurs.
 *
 * « Automatiser » n'est pas proposé (#2449.26 : la fonctionnalité doit exister
 * réellement, et Laura n'exécute rien sans clic). Il n'est pas caché en
 * silence : la note dit où vit ce qui agit seul — les routines.
 *
 * ⚠️ Une lecture ÉCHOUÉE ne s'affiche pas « par défaut » : ce serait dire à
 * quelqu'un qu'il n'a rien réglé alors qu'on n'a simplement rien lu.
 */
export function ActionLevelSettings() {
  const { t } = useTranslation('actions')
  const query = useActionLevel()
  const update = useSetActionLevel()
  const name = useId()

  const choose = (choice: SettableActionLevel | typeof DEFAULT_CHOICE) => {
    if (update.isPending) return
    update.mutate({ level: choice === DEFAULT_CHOICE ? null : choice })
  }

  if (query.isLoading) return <ScreenState state="loading" message={t('actionLevel.setting.loading')} />
  if (query.isError || !query.data) return <ScreenState state="error" message={t('actionLevel.setting.error')} />

  const current = query.data.level ?? DEFAULT_CHOICE
  const choices: { value: SettableActionLevel | typeof DEFAULT_CHOICE; label: string; hint: string }[] = [
    { value: DEFAULT_CHOICE, label: t('actionLevel.setting.default'), hint: t('actionLevel.setting.defaultHint') },
    ...SETTABLE_ACTION_LEVELS.map(level => ({
      value: level,
      label: t(`actionLevel.levels.${level}`),
      hint: t(`actionLevel.levelHelp.${level}`),
    })),
  ]

  return (
    <Box className="mt-6">
      <SettingsBlock label={t('actionLevel.label')} description={t('actionLevel.setting.description')}>
        <Box role="radiogroup" aria-label={t('actionLevel.label')} className="flex flex-col gap-1 px-5 py-4 sm:px-6">
          {choices.map(choice => (
            <label
              key={choice.value}
              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md py-2 has-[:disabled]:cursor-default"
            >
              <input
                type="radio"
                name={name}
                value={choice.value}
                checked={current === choice.value}
                disabled={update.isPending}
                onChange={() => choose(choice.value)}
                className="mt-1"
              />
              <span className="min-w-0">
                <Text element="span" size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
                  {choice.label}
                </Text>
                <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]" className="block">
                  {choice.hint}
                </Text>
              </span>
            </label>
          ))}
          <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]" className="pt-2">
            {t('actionLevel.setting.automateNote')}{' '}
            <Link to="/settings/routines" className="underline">
              {t('actionLevel.setting.automateLink')}
            </Link>
          </Text>
        </Box>
      </SettingsBlock>
    </Box>
  )
}

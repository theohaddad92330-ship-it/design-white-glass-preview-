import { Box, Button, Text } from '@bellum/ui'
import type { ConnectedTool } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'

/**
 * L'écran de prévisualisation avant la PREMIÈRE synchronisation (#2207.20 à
 * #2207.24) — distinct du pré-consentement (`PreConsent.tsx`, avant la
 * redirection OAuth) : celui-ci vient APRÈS la connexion, juste avant de
 * lancer le travail de lecture.
 *
 * Chaque fait s'ajoute un à la fois, un chantier à la fois : périmètre
 * (#2207.20), période (#2207.21), objets (#2207.22), durée (#2207.23), coût
 * (#2207.24). Au 25/09/2026, les cinq facettes sont branchées.
 */
export function SyncLaunchPreview({
  tool,
  name,
  onCancel,
  onLaunch,
  launching,
}: {
  /** L'outil du REGISTRE correspondant, quand il a pu être identifié
   *  (`findToolForProvider`) — `undefined` pour les facettes qu'il porte,
   *  jamais deviné (#2207.21 à #2207.24). */
  tool?: ConnectedTool
  name: string
  onCancel: () => void
  onLaunch: () => void
  launching: boolean
}) {
  const { t, i18n } = useTranslation('integrationCenter')
  const lang = i18n.language.startsWith('en') ? 'en' : 'fr'

  return (
    <Box className="space-y-2 rounded-lg border border-[var(--bellum-border)] p-3">
      <Text size="xs" weight="semibold">
        {t('syncPreview.title', { name })}
      </Text>
      {/* #2207.20 — le périmètre : QUEL compte est en jeu. */}
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {t('syncPreview.scope', { name })}
      </Text>
      {/* #2207.21 — la période DÉCLARÉE par le connecteur, jamais devinée
          (`coverage_period`, REQUIS au contrat — `null` est une réponse à
          part entière, pas un champ qu'on aurait oublié de lire). Réutilise
          les MÊMES clés que `ConnectorDiagnostics` (GA-26 : un réglage vit à
          un seul endroit). */}
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {tool?.coverage_period
          ? t('coveragePeriod', { value: tool.coverage_period[lang] })
          : t('coveragePeriodUnknown')}
      </Text>
      {/* #2207.22 — les OBJETS lus, une LISTE : une absence n'y fait AUCUNE
          ligne (doctrine « on n'affiche pas ce qu'on n'a pas ») — la section
          entière disparaît plutôt que de rendre un titre au-dessus de rien. */}
      {tool && tool.data_types.reads.length > 0 ? (
        <Box className="space-y-0.5">
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('syncPreview.objectsTitle')}
          </Text>
          {tool.data_types.reads.map(token => (
            <Text key={token} size="xs" color="text-[var(--bellum-text-secondary)]">
              · {t(`dataTypeKeys.${token}`, { defaultValue: token })}
            </Text>
          ))}
        </Box>
      ) : null}
      {/* #2207.23 — la durée ESTIMÉE, DÉCLARÉE par Bellum (jamais mesurée sur
          CET espace, jamais une probabilité) — toujours affichée, y compris
          « non précisée » : contrairement aux objets (une liste), la durée
          est un FAIT UNIQUE dont l'absence se dit, elle ne disparaît pas. */}
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {tool?.sync_duration_estimate
          ? t('syncPreview.durationTitle', { value: tool.sync_duration_estimate[lang] })
          : t('syncPreview.durationUnknown')}
      </Text>
      {/* #2207.24 — le COÛT, `cost_model` (optionnel au contrat, comme
          `rate_limits` : une entrée du catalogue qui ne le déclare pas rend
          `undefined`, jamais une case vide silencieuse ici). */}
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {tool?.cost_model ? t('syncPreview.costTitle', { value: tool.cost_model[lang] }) : t('syncPreview.costUnknown')}
      </Text>
      <Box display="flex" className="justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t('syncPreview.later')}
        </Button>
        <Button variant="default" size="sm" isLoading={launching} onClick={onLaunch}>
          {t('syncPreview.launch')}
        </Button>
      </Box>
    </Box>
  )
}

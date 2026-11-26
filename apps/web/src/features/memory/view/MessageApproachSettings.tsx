import { useTranslation } from 'react-i18next'
import { Box, FilterChips, Text } from '@bellum/ui'
import { useMessageApproach, useSetMessageApproach } from '@/features/memory/hooks/useMessageApproach'

const DEFAULT_CHOICE = 'default'

/**
 * #4060 — « Approche directe » pour les messages que tu envoies, enregistrée pour les messages suivants.
 *
 * Même sac `user_preferences`, même écran que `ReplyPreferencesSettings` (un réglage à un seul endroit,
 * GA-26) — mais une autre question : ici le message écrit à un TIERS, pas la forme des réponses de Laura.
 * Un objectif choisi dans le composer passe toujours avant. « Par défaut » RETIRE la clé (réversible).
 *
 * ⚠️ Une lecture ÉCHOUÉE ne s'affiche pas « Par défaut » : on n'a simplement rien lu.
 */
export function MessageApproachSettings() {
  const { t } = useTranslation('knowledge')
  const { data, isLoading, isError } = useMessageApproach()
  const setApproach = useSetMessageApproach()

  const choose = (next: string | null) => {
    const current = data ?? DEFAULT_CHOICE
    if (!next || next === current || setApproach.isPending) return
    setApproach.mutate(next === 'direct' ? 'direct' : null)
  }

  return (
    <Box className="flex flex-col gap-3 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3">
      <Box className="flex flex-col gap-1">
        <Text element="h3" size="sm" weight="semibold">
          {t('memoryLedger.messageApproach.title')}
        </Text>
        <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('memoryLedger.messageApproach.intro')}
        </Text>
      </Box>
      {isLoading ? (
        <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]">
          {t('memoryLedger.loading')}
        </Text>
      ) : isError ? (
        <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]">
          {t('memoryLedger.messageApproach.unreadable')}
        </Text>
      ) : (
        <FilterChips
          ariaLabel={t('memoryLedger.messageApproach.label')}
          legend={t('memoryLedger.messageApproach.label')}
          value={data ?? DEFAULT_CHOICE}
          onChange={choose}
          options={[
            {
              value: DEFAULT_CHOICE,
              label: t('memoryLedger.reply.default'),
              hint: t('memoryLedger.messageApproach.defaultHint'),
            },
            { value: 'direct', label: t('memoryLedger.messageApproach.direct') },
          ]}
        />
      )}
    </Box>
  )
}

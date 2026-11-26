import { Box, Button, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useLinkedInFollowUps, usePostIdeas } from '../api'

/**
 * Ce que le réseau professionnel doit à un commercial cette semaine : les
 * connexions acceptées restées silencieuses, et des sujets de publication.
 *
 * On propose des SUJETS, jamais un post rédigé : ce qui est publié sous son nom
 * engage sa crédibilité auprès de gens qui le connaissent, et un texte
 * entièrement généré se reconnaît.
 */
export function NetworkPlaybookCard() {
  const { t } = useTranslation('accounts')
  const { data: followUps = [] } = useLinkedInFollowUps()
  const ideas = usePostIdeas()

  return (
    <Box className="space-y-3 rounded-xl border border-[var(--bellum-border)] p-4">
      <Box className="space-y-1">
        <Text weight="medium" size="sm">
          {t('network.title')}
        </Text>
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('network.subtitle')}
        </Text>
      </Box>

      {followUps.length > 0 ? (
        <Box className="space-y-1">
          <Text size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]">
            {t('network.toFollowUp')}
          </Text>
          {followUps.slice(0, 5).map(row => (
            <Text key={row.contactId} size="xs">
              • {row.contactName ?? t('network.unnamedContact')} —{' '}
              {t('network.daysSilent', { count: row.daysSinceAccepted })}
            </Text>
          ))}
        </Box>
      ) : null}

      <Button size="sm" variant="outline" disabled={ideas.isPending} onClick={() => ideas.mutate(undefined)}>
        {ideas.isPending ? t('network.thinking') : t('network.postIdeas')}
      </Button>

      {ideas.data ? (
        ideas.data.length === 0 ? (
          // Un contexte trop mince produit zéro sujet, jamais un sujet creux.
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('network.noIdeas')}
          </Text>
        ) : (
          <Box className="space-y-2">
            {ideas.data.map(idea => (
              <Box key={idea.angle} className="rounded-lg bg-[var(--bellum-surface-2)] p-2">
                <Text size="xs" weight="medium">
                  {idea.angle}
                </Text>
                {idea.whyNow ? (
                  <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                    {idea.whyNow}
                  </Text>
                ) : null}
                {idea.openingLine ? (
                  <Text size="xs" className="mt-1 italic">
                    « {idea.openingLine} »
                  </Text>
                ) : null}
                {/* L'ancrage est affiché : c'est ce qui distingue un sujet d'une
                    généralité, et ce qui permet de le refuser d'un coup d'œil. */}
                <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
                  {t('network.groundedOn', { source: idea.groundedOn })}
                </Text>
              </Box>
            ))}
          </Box>
        )
      ) : null}

      {ideas.isError ? (
        <Text size="xs" className="text-[var(--danger-soft-text)]">
          {(ideas.error as Error).message}
        </Text>
      ) : null}
    </Box>
  )
}

import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { ObjectMention } from '@/components/primitives/ObjectMention'
import { formatTimeAgo } from '@/lib/relative-time'
import type { RecentActivityEvent } from '../activity'

/**
 * ACTIVITÉ RÉCENTE — quatre natures d'événement, aucun auteur inventé.
 *
 * `activity.ts` ne rend que ce que le CRA et la facturation savent déjà :
 * l'objet source ne porte aucun nom d'acteur, donc ce panneau n'en affiche
 * aucun — contrairement à la maquette (« CRA validé par Marie Dupont »), qui
 * promet une donnée que le produit ne mesure pas.
 */
export function RecentActivityPanel({
  events,
  isLoading,
}: {
  events: readonly RecentActivityEvent[]
  isLoading: boolean
}) {
  const { t } = useTranslation('missionTracking')

  return (
    <Box className="flex flex-col gap-3 rounded-xl border border-[var(--bellum-border)] p-4">
      <Text size="sm" weight="semibold">
        {t('activity.title')}
      </Text>

      {isLoading ? (
        <Text size="sm" color="text-muted-foreground">
          {t('common:states.loading')}
        </Text>
      ) : events.length === 0 ? (
        <Text size="sm" color="text-muted-foreground">
          {t('activity.empty')}
        </Text>
      ) : (
        <Box className="flex flex-col gap-2">
          {events.map((event, index) => (
            <Box
              key={`${event.kind}-${event.missionId}-${event.at}-${index}`}
              className="flex items-start justify-between gap-3"
            >
              <Box className="flex min-w-0 flex-col gap-0.5">
                <Text size="sm">{t(`activity.kind.${event.kind}`)}</Text>
                <ObjectMention kind="mission" id={event.missionId} name={event.missionLabel} />
              </Box>
              <Text size="xs" color="text-muted-foreground" className="shrink-0">
                {formatTimeAgo(event.at)}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

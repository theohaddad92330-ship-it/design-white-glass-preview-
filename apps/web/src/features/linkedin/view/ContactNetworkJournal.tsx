import type { LinkedInInteractionKind } from '@bellum/contracts'
import { Badge, Box, Button, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useContactInteractions, useRecordInteraction } from '../api'

const KINDS: LinkedInInteractionKind[] = [
  'connection_sent',
  'connection_accepted',
  'message_sent',
  'reply_received',
  'post_engagement',
]

/**
 * Le journal du réseau professionnel, sur la fiche d'un contact.
 *
 * Le scraping est refusé (décision Louis, adossée à l'étude ToS du dépôt) : le
 * compte banni serait celui de l'utilisateur, pas le nôtre. Ce que le rapport
 * demande — suivre les connexions, relancer celles qui restent sans réponse —
 * s'obtient autrement : le commercial déclare, et Bellum se souvient. Personne
 * ne se souvient de trente invitations envoyées ; une base, si.
 */
export function ContactNetworkJournal({ contactId }: { contactId: string }) {
  const { t, i18n } = useTranslation('contacts')
  const { data: interactions = [] } = useContactInteractions(contactId)
  const record = useRecordInteraction(contactId)

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso))

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

      <Box className="flex flex-wrap gap-1.5">
        {KINDS.map(kind => (
          <Button
            key={kind}
            size="sm"
            variant="outline"
            disabled={record.isPending}
            onClick={() => record.mutate({ contactId, kind })}
          >
            {t(`network.kind.${kind}`)}
          </Button>
        ))}
      </Box>

      {interactions.length === 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('network.empty')}
        </Text>
      ) : (
        <Box className="space-y-1">
          {interactions.slice(0, 8).map(item => (
            <Box key={item.id} className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {t(`network.kind.${item.kind}`)}
              </Badge>
              <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                {formatDate(item.occurredAt)}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {record.isError ? (
        <Text size="xs" className="text-[var(--danger-soft-text)]">
          {(record.error as Error).message}
        </Text>
      ) : null}
    </Box>
  )
}

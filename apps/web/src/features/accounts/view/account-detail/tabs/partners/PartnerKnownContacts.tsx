import type { PartnerRank } from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import { PenLine } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useContactsByAccount } from '@/features/contacts/hooks/useContactsByAccount'
import { useOptionalContactEngagement } from '../../components/contact-engagement/ContactEngagementContext'

/**
 * #4987 — les contacts DÉJÀ en base d'une ESN de rang 2, sur un grand compte.
 *
 * Le rapprochement ESN → compte est celui du serveur (`workspace_account_id`, sans ambiguïté) ; les contacts sont
 * la lecture existante `GET /contacts/account/:id` (bornée à l'espace et au périmètre). ESN absente de l'espace ou
 * sans contact ⇒ « aucun contact connu » : jamais un contact inventé, aucune collecte. « Préparer un message »
 * ouvre le brouillon existant — le copilote prépare, il n'envoie jamais. Un rang observé n'est pas « rang 2 »
 * (#1624.6) : seule une ESN de rang 2 DÉCLARÉ porte ce bloc.
 */
export function PartnerKnownContacts({
  rank,
  name,
  workspaceAccountId,
}: {
  rank: PartnerRank
  name: string
  workspaceAccountId: string | undefined
}) {
  const { t } = useTranslation('partners')
  const engagement = useOptionalContactEngagement()
  const { data, isPending, isError } = useContactsByAccount(rank === 'rank2' ? (workspaceAccountId ?? null) : null)

  if (rank !== 'rank2') return null

  const title = (
    <Text size="xs" weight="semibold" color="text-[var(--bellum-text-primary)]">
      {t('knownContacts.title')}
    </Text>
  )
  if (!workspaceAccountId) {
    return (
      <Box className="flex flex-col gap-1" data-testid="partner-known-contacts">
        {title}
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('knownContacts.none')}
        </Text>
      </Box>
    )
  }
  if (isPending || isError) return null
  const contacts = data ?? []
  return (
    <Box className="flex flex-col gap-1.5" data-testid="partner-known-contacts">
      {title}
      {contacts.length === 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('knownContacts.none')}
        </Text>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {contacts.map(contact => (
            <li key={contact.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 flex-col">
                <Text size="sm">{contact.full_name}</Text>
                {contact.title ? (
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {contact.title}
                  </Text>
                ) : null}
              </span>
              {engagement ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  icon={PenLine}
                  aria-label={t('knownContacts.prepareAria', { name: contact.full_name, esn: name })}
                  onClick={() => engagement.openEngagement([contact], 'email')}
                >
                  {t('knownContacts.prepare')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Box>
  )
}

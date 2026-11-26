import type { Contact, OutreachMessage, OutreachMessageStatus } from '@bellum/contracts'
import { Badge, Box, Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { MessageSquareText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getAvailableChannels } from '@/features/accounts/view/account-detail/components/contact-engagement/channel'
import { useContactEngagement } from '@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext'
import type { EngagementChannel } from '@/features/accounts/view/account-detail/components/contact-engagement/types'
import { useOutreachMessages } from '@/features/outreach/hooks/useOutreachMessages'
import { SectionCard } from './SectionCard'

/** Les états où le message se TRAVAILLE encore : au-delà (planifié, envoyé…), reprendre n'a plus de sens. */
export const RESUMABLE: ReadonlySet<OutreachMessageStatus> = new Set([
  'idea',
  'drafting',
  'drafted',
  'needs_review',
  'approved',
])

/**
 * #2366.1 — la fiche Contact relit le MÊME objet canonique
 * (`outreach_messages`) que le centre d'approbation Outreach, filtré par ce
 * contact. Aucune copie : c'est la garantie qu'un message ouvert d'ici et un
 * message ouvert depuis le fil Laura (#2366.2) sont identiques.
 *
 * #3689 — une absence ne fait AUCUNE carte (plus de « aucun message »). Ce qui
 * existe se REPREND dans l'éditeur commun (`openEngagement`, le même que le
 * bouton Contacter) : un seul parcours de préparation, jamais un second éditeur
 * ni un second historique.
 */
export function ContactOutreachMessagesCard({ contact }: { contact: Contact }) {
  const { t } = useTranslation('outreach')
  const { data: messages } = useOutreachMessages(contact.id)
  const { openEngagement } = useContactEngagement()
  if (!messages || messages.length === 0) return null

  // Pas de coordonnée pour le canal du brouillon : l'envoi sera limité, pas la
  // préparation — on rouvre l'éditeur sur le premier canal disponible.
  const channels = getAvailableChannels(contact)
  const resume = (message: OutreachMessage) => {
    const wanted = message.channel as EngagementChannel
    const channel = channels.includes(wanted) ? wanted : channels[0]
    if (channel) openEngagement([contact], channel)
  }

  return (
    <SectionCard icon={MessageSquareText} title={t('messagesCard.title')}>
      <Box className="space-y-3">
        {messages.map(message => (
          <MessageRow
            key={message.id}
            message={message}
            onResume={RESUMABLE.has(message.status) && channels.length > 0 ? () => resume(message) : undefined}
          />
        ))}
        <Link to="/actions/sequences" className="inline-block text-sm text-[var(--bellum-text-accent)] underline">
          {t('messagesCard.openQueue')}
        </Link>
      </Box>
    </SectionCard>
  )
}

function MessageRow({ message, onResume }: { message: OutreachMessage; onResume?: () => void }) {
  const { t } = useTranslation('outreach')
  return (
    <Box className="rounded-xl border border-border/60 p-3 space-y-1.5">
      <Box display="flex" className="items-center gap-2">
        {/* `subject` est nullable (un appel n'en porte pas) — absent = aucune ligne, jamais "null" (GA-18/19). */}
        {message.subject ? (
          <Text element="p" size="sm" weight="semibold" className="min-w-0 flex-1 truncate">
            {message.subject}
          </Text>
        ) : (
          <Box className="min-w-0 flex-1" />
        )}
        {/* i18n keys: messageStatus.idea | drafting | drafted | needs_review | approved |
            scheduled | sending | sent | delivered | bounced | replied | failed | cancelled |
            expired | copied_manual — mêmes clés que le centre d'approbation (GA-26). */}
        <Badge variant="outline" className="shrink-0">
          {t(`messageStatus.${message.status}`)}
        </Badge>
      </Box>
      <Text element="p" size="sm" color="text-muted-foreground" className="line-clamp-3">
        {message.body}
      </Text>
      {/* #3689 — qui, quelle version, quelle validation : lisible sans ouvrir la file. */}
      <Text element="p" size="xs" color="text-muted-foreground">
        {[
          message.contact_name ? t('messagesCard.recipient', { name: message.contact_name }) : null,
          t('messagesCard.version', { version: message.current_version }),
          message.approval ? t('messagesCard.approved', { version: message.approval.version }) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {onResume ? (
        <Button size="sm" variant="outline" onClick={onResume}>
          {t('messagesCard.resume')}
        </Button>
      ) : null}
      {/* #3419/#3420 (30/09, lot C16) — les mêmes bloquants que le centre
          d'approbation (`approval.blocker.*`, GA-26 : une seule clé i18n),
          visibles ici où le retour bêta a été déposé. */}
      {message.blockers.length > 0 ? (
        <Box className="flex flex-wrap gap-1" aria-label={t('approval.blockersLabel')}>
          {message.blockers.map(b => (
            <Badge key={b} variant="outline" className="text-[var(--danger-soft-text)]">
              {t(`approval.blocker.${b}`)}
            </Badge>
          ))}
        </Box>
      ) : null}
    </Box>
  )
}

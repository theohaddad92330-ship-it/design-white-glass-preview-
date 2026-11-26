import type { Contact } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { FileEdit } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getAvailableChannels } from '@/features/accounts/view/account-detail/components/contact-engagement/channel'
import { useContactEngagement } from '@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext'
import type { EngagementChannel } from '@/features/accounts/view/account-detail/components/contact-engagement/types'
import { useOutreachMessages } from '@/features/outreach/hooks/useOutreachMessages'
import { formatDate } from '@/lib/locale'
import { RESUMABLE } from './ContactOutreachMessagesCard'

/**
 * Théo B c5-fiche-contact.N2 — « Brouillon, non envoyé — Reprendre le brouillon » en tête du fil d'historique.
 * Lit le MÊME objet canonique que la carte « Messages préparés » (`useOutreachMessages`, même cache) ; reprendre
 * rouvre l'éditeur commun, jamais un second parcours. Un brouillon n'est PAS un échange : il n'entre ni dans le fil
 * réel ni dans la dérivation du badge de relation. Aucun brouillon à reprendre = aucune ligne.
 */
export function ContactPendingDrafts({ contact }: { contact: Contact }) {
  const { t } = useTranslation('contacts')
  const { data: messages } = useOutreachMessages(contact.id)
  const { openEngagement } = useContactEngagement()
  const drafts = (messages ?? []).filter(message => RESUMABLE.has(message.status))
  if (drafts.length === 0) return null

  const channels = getAvailableChannels(contact)
  const resume = (wanted: string) => {
    const channel = channels.includes(wanted as EngagementChannel) ? (wanted as EngagementChannel) : channels[0]
    if (channel) openEngagement([contact], channel)
  }

  return (
    <ul className="mb-4 space-y-2" aria-label={t('pendingDrafts.label')}>
      {drafts.map(draft => {
        const when = formatDate(draft.updated_at, { day: 'numeric', month: 'short' })
        return (
          <li
            key={draft.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-border/60 p-3"
          >
            <FileEdit className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <Text element="p" size="sm" className="min-w-0 flex-1">
              {[when, t('pendingDrafts.notSent'), draft.subject].filter(Boolean).join(' · ')}
            </Text>
            {channels.length > 0 ? (
              <Button size="sm" variant="outline" className="min-h-11" onClick={() => resume(draft.channel)}>
                {t('pendingDrafts.resume')}
              </Button>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

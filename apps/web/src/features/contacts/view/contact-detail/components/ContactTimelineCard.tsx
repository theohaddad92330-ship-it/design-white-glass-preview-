import type { Contact } from '@bellum/contracts'
import { Button } from '@bellum/ui'
import { History, Reply } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CONTACT_TIMELINE_CATEGORIES } from '@/features/activities/model/timeline'
import { TimelinePanel } from '@/features/activities/view/TimelinePanel'
import { getAvailableChannels } from '@/features/accounts/view/account-detail/components/contact-engagement/channel'
import { useContactEngagement } from '@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext'
import { ContactPendingDrafts } from './ContactPendingDrafts'
import { SectionCard } from './SectionCard'

/**
 * L'historique des échanges AVEC CETTE PERSONNE.
 *
 * Distinct de la timeline du compte : ce qu'on veut savoir avant d'appeler
 * quelqu'un, c'est ce qu'on lui a dit à LUI — pas ce qui s'est passé chez son
 * employeur. Les deux vues lisent la même table, avec deux portées.
 *
 * Le bouton de capture est masqué ici : la capture est globale à l'espace, et
 * le proposer sur chaque fiche ferait croire qu'elle ne concerne que ce contact.
 *
 * #3689 — c'est AUSSI la porte de la réponse : la messagerie locale de la
 * fiche a disparu, le fil porte les messages envoyés et reçus, et quand le
 * contact a répondu, « Répondre » rouvre l'éditeur commun (le même que
 * Contacter). Sans canal joignable, pas de bouton mort.
 */
export function ContactTimelineCard({ contact, composeSignal }: { contact: Contact; composeSignal: number }) {
  const { t } = useTranslation('activities')
  const { openEngagement } = useContactEngagement()
  const channel = getAvailableChannels(contact)[0]
  const canReply = contact.user_status === 'replied' && channel !== undefined

  return (
    <SectionCard icon={History} title={t('card.contactTitle')}>
      {canReply ? (
        <Button
          size="sm"
          variant="outline"
          icon={Reply}
          className="mb-4"
          onClick={() => openEngagement([contact], channel)}
        >
          {t('card.reply')}
        </Button>
      ) : null}
      {/* Théo B c5.N2 — le brouillon non envoyé se lit dans le fil, avec « Reprendre le brouillon ». */}
      <ContactPendingDrafts contact={contact} />
      <TimelinePanel
        scope="contact"
        entityId={contact.id}
        contactId={contact.id}
        // #1473 — sans compte, le fil reste celui de la PERSONNE. `undefined`
        // et non `null` : la prop est optionnelle, et un `null` explicite se
        // sérialiserait dans la requête de journalisation.
        accountId={contact.account_id ?? undefined}
        showSync={false}
        // #3688.2 — le geste vit dans la barre de travail, au-dessus de la carte.
        showLogAction={false}
        composeSignal={composeSignal}
        // #3688.7 — le fil d'une PERSONNE ouvre sur la relation client ; l'interne et les opérations restent à un clic.
        categories={CONTACT_TIMELINE_CATEGORIES}
        defaultCategory="client"
      />
    </SectionCard>
  )
}

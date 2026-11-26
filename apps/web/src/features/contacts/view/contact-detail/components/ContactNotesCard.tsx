import type { Contact } from '@bellum/contracts'
import { StickyNote } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NotesPanel } from '@/features/crm-core/view/NotesPanel'
import { useCurrentUserStore } from '@/stores/currentUserStore'
import { SectionCard } from './SectionCard'

/**
 * Les notes du contact — remplace l'éditeur de note UNIQUE.
 *
 * Une chaîne écrasée à chaque saisie faisait que deux commerciaux sur la même
 * fiche s'effaçaient l'un l'autre, et une information non datée ne vaut rien.
 * Les notes existantes ont été reprises comme première note par la migration.
 */
export function ContactNotesCard({ contact }: { contact: Contact }) {
  const { t } = useTranslation('crm')
  const currentUser = useCurrentUserStore(state => state.currentUser)

  return (
    <SectionCard icon={StickyNote} title={t('notes.title')}>
      <NotesPanel entityType="contact" entityId={contact.id} currentUserId={currentUser?.id} />
    </SectionCard>
  )
}

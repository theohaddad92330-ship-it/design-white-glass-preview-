import { Box, Button } from '@bellum/ui'
import { ClipboardList, MessageSquarePlus, StickyNote } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ContactCallTaskDialog } from './ContactCallTaskDialog'
import { ContactQuickAddSheet } from './ContactQuickAddSheet'

/**
 * #3688.1 — les trois gestes de travail, au HAUT de la zone centrale : prendre
 * une note, consigner un échange, créer une tâche. Aucun ne crée d'objet à lui
 * seul : la note focalise l'éditeur de `NotesPanel`, l'échange ouvre le dialogue
 * de `TimelinePanel`, la tâche ouvre le créateur d'appel (même route qu'avant).
 */
export function ContactWorkBar({
  contactId,
  accountId,
  onAddNote,
  onLogExchange,
}: {
  contactId: string
  /** #4135 — le compte du contact, pour la tâche créée depuis la feuille. Absent = aucun geste feuille. */
  accountId?: string | null
  onAddNote: () => void
  onLogExchange: () => void
}) {
  const { t } = useTranslation('contacts')
  const [taskOpen, setTaskOpen] = useState(false)
  return (
    <Box display="flex" className="flex-wrap items-center gap-2" role="group" aria-label={t('workBar.label')}>
      <Button variant="black" size="sm" icon={StickyNote} onClick={onAddNote}>
        {t('workBar.note')}
      </Button>
      <Button variant="outline" size="sm" icon={MessageSquarePlus} onClick={onLogExchange}>
        {t('workBar.exchange')}
      </Button>
      <Button variant="outline" size="sm" icon={ClipboardList} onClick={() => setTaskOpen(true)}>
        {t('workBar.task')}
      </Button>
      {accountId !== undefined ? <ContactQuickAddSheet contactId={contactId} accountId={accountId} /> : null}
      <ContactCallTaskDialog contactId={contactId} open={taskOpen} onOpenChange={setTaskOpen} />
    </Box>
  )
}

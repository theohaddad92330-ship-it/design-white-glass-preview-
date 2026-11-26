import type { Contact } from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import { StickyNote } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ContactEnrichButton } from './ContactEnrichButton'

type ContactEmptyTabCtaProps = {
  contact: Contact
  /** Empty-state copy (why the tab is empty). */
  message: string
  /** Switches to the Résumé tab and focuses the note editor. */
  onAddNote: () => void
}

/**
 * Empty-tab call to action (Théo P0 « Fiche contact » : les onglets vides
 * doivent proposer une action — enrichir / note). Turns a dead-end empty tab
 * into two next steps: enrich the contact (may surface relations/activity) or
 * jot a note.
 */
export function ContactEmptyTabCta({ contact, message, onAddNote }: ContactEmptyTabCtaProps) {
  const { t } = useTranslation('contacts')
  return (
    <Box display="flex" className="flex-col items-start gap-4 py-2">
      <Text element="p" size="sm" color="text-muted-foreground">
        {message}
      </Text>
      <Box display="flex" className="flex-wrap items-center gap-2">
        <ContactEnrichButton contact={contact} fullWidth={false} label={t('enrich.contactButton')} />
        <Button variant="outline" size="sm" icon={StickyNote} onClick={onAddNote}>
          {t('note.addButton')}
        </Button>
      </Box>
    </Box>
  )
}

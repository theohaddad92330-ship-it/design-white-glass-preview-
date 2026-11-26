import type { OutreachPlaybookKey } from '@bellum/contracts'
import { useMemo, useState } from 'react'
import { useContact } from '@/features/contacts/hooks/useContact'
import { playbookFromSearch } from '../campaign-prefill'
import { PlaybookWizardDialog } from './PlaybookWizardDialog'

/**
 * Lot L-C (#4166) — l'assistant, ouvert DEPUIS un compte ou un signal.
 *
 * `?playbook_contact=<uuid>&signal=hiring` : les deux premières réponses sont
 * déjà posées (le contact, le « pourquoi maintenant »). Même patron que la
 * campagne de Laura : on LIT l'URL, on n'y réécrit rien (pas de `<Navigate>`,
 * GA-27), une seule ouverture par contact. Rendu seulement si l'URL le demande,
 * pour que l'écran ne charge aucun contact autrement.
 */
export function PlaybookFromUrl({ search }: { search: Record<string, unknown> }) {
  const wanted = useMemo(() => playbookFromSearch(search), [search])
  if (!wanted) return null
  return <Loaded contactId={wanted.contactId} trigger={wanted.trigger} />
}

function Loaded({ contactId, trigger }: { contactId: string; trigger: OutreachPlaybookKey | null }) {
  const contact = useContact(contactId)
  const [closed, setClosed] = useState(false)
  if (!contact.data) return null
  return (
    <PlaybookWizardDialog
      open={!closed}
      onOpenChange={open => setClosed(!open)}
      initialContact={{ id: contact.data.id, full_name: contact.data.full_name }}
      initialTrigger={trigger}
    />
  )
}

import { createFileRoute } from '@tanstack/react-router'
import { AutomationTrialsJournalPage } from '@/features/automations/view/AutomationTrialsJournalPage'

/** Théo C automations-bibliotheque.N3 — `/actions/automatisations/journal` : le journal des essais. */
export const Route = createFileRoute('/actions/automatisations_/journal')({
  component: AutomationTrialsJournalPage,
})

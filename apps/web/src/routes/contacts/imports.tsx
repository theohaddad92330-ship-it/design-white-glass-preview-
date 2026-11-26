import { createFileRoute } from '@tanstack/react-router'
import { ContactsImportsSourcesPage } from '@/features/contacts/view/ContactsImportsSourcesPage'

/**
 * `/contacts/imports` — Imports & sources (Théo B c3-imports-sources), sous l'en-tête et les onglets communs de
 * Contacts (#4503.1), avec « Relire les doublons » (#4503.7).
 */
export const Route = createFileRoute('/contacts/imports')({
  component: ContactsImportsSourcesPage,
})

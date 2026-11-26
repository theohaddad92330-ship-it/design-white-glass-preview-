import { createFileRoute } from '@tanstack/react-router'
import { ContactListsPage } from '@/features/target-lists/view/ContactListsPage'

/** Théo B c2-mes-listes.R1 — « Contacts › Mes listes » : les sélections de travail, comptes et contacts. */
export const Route = createFileRoute('/contacts/lists')({
  component: ContactListsPage,
})

import { createFileRoute } from '@tanstack/react-router'
import { ExpenseReportsPage } from '@/features/expenses/view/ExpenseReportsPage'

/**
 * Théo C missions-notes-de-frais.N1 — « Notes de frais », onglet de Missions.
 *
 * L'écran de `/expenses` (Louis 22/10/2026) : même page, désormais dans la
 * barre de Missions à côté de Planning et Facturation. `/expenses` redirige ici.
 */
export const Route = createFileRoute('/missions/notes-de-frais')({
  component: ExpenseReportsPage,
})

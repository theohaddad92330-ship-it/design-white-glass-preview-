import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Théo C missions-notes-de-frais.N1 — `/expenses` → `/missions/notes-de-frais`.
 *
 * La page vit désormais comme onglet de Missions. Les liens déjà partis (routines
 * de Laura, notifications) arrivent au bon écran ; `replace: true` pour que
 * « précédent » ne reboucle pas. `beforeLoad`, jamais `<Navigate>` (GA-27). Le barème
 * (`/expenses/bareme`) garde sa porte tant que Réglages › Espace ne le porte pas.
 */
export const Route = createFileRoute('/expenses/')({
  beforeLoad: () => {
    throw redirect({ to: '/missions/notes-de-frais', replace: true })
  },
})

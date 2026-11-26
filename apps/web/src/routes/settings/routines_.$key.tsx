import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/settings/routines/<clé>` → `/settings/routines?routine=<clé>`.
 *
 * Maquette `settings-laura` (Théo V22, Louis 22/10/2026) : le détail d'une routine s'ouvre dans un tiroir, la liste
 * restant en vue. L'adresse de la page survit pour ses liens entrants (fiche d'une séquence sur signal, rails de
 * suivi) — « on archive, on ne supprime pas ». `beforeLoad`, jamais `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/settings/routines_/$key')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/settings/routines', search: { routine: params.key }, replace: true })
  },
})

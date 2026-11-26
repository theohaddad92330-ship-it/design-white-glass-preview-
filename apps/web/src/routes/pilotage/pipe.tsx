import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/pilotage/pipe` → `/pilotage#pipe`.
 *
 * Louis 22/10/2026 (QCM A/D) : Pilotage est UNE page, Cockpit · Pipe · Staffing · Finance en sections
 * ancrées. Renverse la décision du 14/10 sur les adresses ; l'adresse survit pour ses liens entrants —
 * « on archive, on ne supprime pas ». `beforeLoad`, jamais `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/pilotage/pipe')({
  // `#parcours` (Parcours, section de Pipe — #4163.2) garde sa propre ancre ; sans elle, la section Pipe.
  beforeLoad: ({ location }) => {
    throw redirect({ to: '/pilotage', hash: location.hash === 'parcours' ? 'parcours' : 'pipe', replace: true })
  },
})

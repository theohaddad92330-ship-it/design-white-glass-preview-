import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/pilotage/staffing` → `/pilotage#staffing`.
 *
 * Louis 22/10/2026 (QCM A/D) : Pilotage est UNE page, Cockpit · Pipe · Staffing · Finance en sections
 * ancrées. Renverse la décision du 14/10 sur les adresses ; l'adresse survit pour ses liens entrants —
 * « on archive, on ne supprime pas ». `beforeLoad`, jamais `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/pilotage/staffing')({
  beforeLoad: () => {
    throw redirect({ to: '/pilotage', hash: 'staffing', replace: true })
  },
})

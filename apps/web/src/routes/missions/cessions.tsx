import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/missions/cessions` → `/missions/finance#cessions`.
 *
 * Théo C missions-finance.A2 — décision Louis du 22/10/2026 : les cessions d'affacturage sont la section
 * « Cessions » de Missions › Finance. L'adresse survit pour ses liens entrants — « on archive, on ne
 * supprime pas ». `beforeLoad`, jamais `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/missions/cessions')({
  beforeLoad: () => {
    throw redirect({ to: '/missions/finance', hash: 'cessions', replace: true })
  },
})

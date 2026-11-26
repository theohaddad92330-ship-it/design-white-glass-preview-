import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/missions/suivi` → `/missions`.
 *
 * Théo C missions-dossier.R2 — décision Louis du 22/10/2026 : le suivi de mission est RÉPARTI.
 * L'état du cycle vit dans le dossier de chaque mission ; les automatismes vivent dans
 * Actions › Automatisations. L'adresse survit pour ses liens entrants.
 *
 * `beforeLoad`, jamais `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/missions/suivi')({
  beforeLoad: () => {
    throw redirect({ to: '/missions', replace: true })
  },
})

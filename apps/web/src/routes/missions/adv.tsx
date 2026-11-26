import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/missions/adv` → `/missions`.
 *
 * Théo C missions-dossier.R2 — décision Louis du 22/10/2026 : l'ADV est FONDUE dans le dossier de
 * mission (bloc « Ce qui bloque le démarrage » en tête, prérequis d'accès/badge/matériel inclus).
 * L'adresse survit pour ses liens entrants — « on archive, on ne supprime pas ».
 *
 * `beforeLoad`, jamais `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/missions/adv')({
  beforeLoad: () => {
    throw redirect({ to: '/missions', replace: true })
  },
})

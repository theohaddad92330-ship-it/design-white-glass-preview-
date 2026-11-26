import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/settings/legal-entities` → `/settings/business-units` (onglet Sociétés).
 *
 * Maquettes Théo V22 (Louis, 22/10/2026) : Périmètres et Sociétés sont deux onglets d'une même page (R2). L'adresse survit pour ses liens entrants — « on archive, on ne
 * supprime pas ». `beforeLoad`, jamais `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/settings/legal-entities')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/business-units', search: { onglet: 'societes' }, replace: true })
  },
})

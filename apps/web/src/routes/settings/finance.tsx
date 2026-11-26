import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/settings/finance` → `/settings/workspace-rules` (onglet Marge).
 *
 * Maquettes Théo V22 (Louis, 22/10/2026) : Le seuil d'alerte de marge est l'onglet Marge de Règles métier. L'adresse survit pour ses liens entrants — « on archive, on ne
 * supprime pas ». `beforeLoad`, jamais `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/settings/finance')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/workspace-rules', search: { onglet: 'marge' }, replace: true })
  },
})

import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/settings/commercial-load` → `/settings/workspace-rules` (onglet Charge).
 *
 * Maquettes Théo V22 (Louis, 22/10/2026) : La charge commerciale est l'onglet Charge de Règles métier. L'adresse survit pour ses liens entrants — « on archive, on ne
 * supprime pas ». `beforeLoad`, jamais `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/settings/commercial-load')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/workspace-rules', search: { onglet: 'charge' }, replace: true })
  },
})

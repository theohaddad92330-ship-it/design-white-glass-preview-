import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/settings/reverse-market` → `/settings/workspace-rules` (onglet Marché inversé).
 *
 * Maquettes Théo V22 (Louis, 22/10/2026) : Le réglage du marché inversé est fondu dans l'onglet Marché inversé de Règles métier (HT-7). L'adresse survit pour ses liens entrants — « on archive, on ne
 * supprime pas ». `beforeLoad`, jamais `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/settings/reverse-market')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/workspace-rules', search: { onglet: 'marche-inverse' }, replace: true })
  },
})

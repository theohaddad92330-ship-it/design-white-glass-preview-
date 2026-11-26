import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/settings/pipeline` → `/settings/workspace-rules` (onglet Pipeline).
 *
 * Maquettes Théo V22 (Louis, 22/10/2026) : Les durées cibles par étape sont l'onglet Pipeline de Règles métier. L'adresse survit pour ses liens entrants — « on archive, on ne
 * supprime pas ». `beforeLoad`, jamais `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/settings/pipeline')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/workspace-rules', search: { onglet: 'pipeline' }, replace: true })
  },
})

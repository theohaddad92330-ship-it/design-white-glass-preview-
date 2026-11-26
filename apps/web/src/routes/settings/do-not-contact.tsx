import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/settings/do-not-contact` → `/settings/workspace-rules` (onglet Accès).
 *
 * Maquettes Théo V22 (Louis, 22/10/2026) : « Ne pas contacter » est une règle d'accès : bloc de l'onglet Accès (A1). L'adresse survit pour ses liens entrants — « on archive, on ne
 * supprime pas ». `beforeLoad`, jamais `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/settings/do-not-contact')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/workspace-rules', search: { onglet: 'acces' }, replace: true })
  },
})

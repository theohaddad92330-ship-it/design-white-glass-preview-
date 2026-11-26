import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/settings/lexicon` → `/settings/catalogues` (onglet Vocabulaire).
 *
 * Maquettes Théo V22 (Louis, 22/10/2026) : Le lexique est l'onglet Vocabulaire de Catalogues & vocabulaire (R4). L'adresse survit pour ses liens entrants — « on archive, on ne
 * supprime pas ». `beforeLoad`, jamais `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/settings/lexicon')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/catalogues', search: { onglet: 'vocabulaire' }, replace: true })
  },
})

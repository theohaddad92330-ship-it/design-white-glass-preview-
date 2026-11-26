import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { RoutineLibraryPage } from '@/features/routines/view/RoutineLibraryPage'

/**
 * Théo C automations-bibliotheque — `/actions/automatisations/bibliotheque` : la bibliothèque de routines.
 *
 * Tiret bas requis : `automatisations.tsx` redirige vers les séquences sur signal (#4357.1) et ne rend jamais ses
 * enfants — sans le tiret bas, cette page s'imbriquerait sous une route qui redirige et ne s'afficherait jamais.
 * `?routine=<clé>` rouvre la fenêtre « Voir le fonctionnement » (lien entrant de l'ancienne fiche
 * `/settings/routines/:key`).
 */
export const Route = createFileRoute('/actions/automatisations_/bibliotheque')({
  validateSearch: z.object({ routine: z.string().optional() }),
  component: RoutineLibraryRoute,
})

function RoutineLibraryRoute() {
  const { routine } = Route.useSearch()
  return <RoutineLibraryPage openKey={routine} />
}

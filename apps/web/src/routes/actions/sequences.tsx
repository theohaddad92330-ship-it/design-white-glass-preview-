import { createFileRoute } from '@tanstack/react-router'
import { SequencesPage } from '@/features/outreach/view/SequencesPage'

/**
 * Pas de nouvelle clé de palier : une `PLAN_FEATURE_KEY` posée sans migration
 * rend 403 pour tout le monde, ce que le dépôt a déjà payé une fois. Les
 * séquences suivent le même palier que le reste de la section Actions.
 */
export const Route = createFileRoute('/actions/sequences')({
  component: SequencesPage,
})

import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { PlanFeatureRoute } from '@/features/plan-features/PlanFeatureRoute'
import { PresentationsPage } from '@/features/submissions/view/PresentationsPage'

/**
 * Théo C projects-presentations — AFFAIRES › PRÉSENTATIONS, `/projects/presentations`.
 *
 * `?project=` filtre sur UNE affaire (la fiche affaire y renvoie depuis « Voir les présentations ») ; un
 * identifiant abîmé dans un lien collé ouvre la liste entière plutôt qu'une erreur.
 *
 * Même palier que le pipe (`feature="needs"`) : une clé de palier neuve sans migration rendrait 403 pour
 * tout le monde. Segment STATIQUE, classé avant `$id` par le routeur.
 */
const presentationsSearchSchema = z.object({
  project: z.string().guid().optional().catch(undefined),
})

export const Route = createFileRoute('/projects/presentations')({
  validateSearch: presentationsSearchSchema,
  component: GatedPage,
})

function GatedPage() {
  const { t } = useTranslation('submissions')
  const { project } = Route.useSearch()
  return (
    <PlanFeatureRoute feature="needs" withShell pageTitle={t('presentations.title')}>
      <PresentationsPage projectId={project} />
    </PlanFeatureRoute>
  )
}

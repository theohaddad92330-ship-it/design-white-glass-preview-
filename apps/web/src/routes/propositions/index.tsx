import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { submissionsApi } from '@/features/submissions/api'
import { mostAdvancedPresentation } from '@/features/submissions/lib/mostAdvancedPresentation'

/**
 * Théo C HT-6 — LE STUDIO DE PROPOSITIONS EST FONDU dans Affaires › Présentations (Louis, 22/10/2026).
 *
 * « La proposition commerciale » vit dans le détail d'une présentation, ouvert depuis la fiche affaire.
 * L'adresse `/propositions` survit en lien profond (Laura, favoris) et REDIRIGE :
 *  - `?project=<affaire>` → la présentation la plus avancée de l'affaire ;
 *  - sans affaire (ou sans présentation) → la liste des présentations, filtrée sur l'affaire si on en a une.
 *
 * `beforeLoad`, jamais `<Navigate>` (GA-27). Une lecture qui échoue ne casse pas le lien : on retombe
 * sur la liste.
 */
const proposalsSearchSchema = z.object({
  project: z.string().guid().optional().catch(undefined),
})

export const Route = createFileRoute('/propositions/')({
  validateSearch: proposalsSearchSchema,
  beforeLoad: async ({ search }) => {
    if (search.project) {
      // Une lecture qui échoue ne casse pas le lien : on retombe sur la liste de l'affaire.
      const target = await submissionsApi
        .list({ projectId: search.project })
        .then(({ items }) => mostAdvancedPresentation(items))
        .catch(() => null)
      if (target) throw redirect({ to: '/submissions/$id', params: { id: target.id }, replace: true })
      throw redirect({ to: '/projects/presentations', search: { project: search.project }, replace: true })
    }
    throw redirect({ to: '/projects/presentations', search: {}, replace: true })
  },
})

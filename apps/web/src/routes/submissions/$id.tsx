import { createFileRoute } from '@tanstack/react-router'
import { SubmissionDossierPage } from '@/features/submissions/view/SubmissionDossierPage'

/**
 * LE DOSSIER D'UN POSITIONNEMENT — `/submissions/:id` (#2953, #2193.48).
 *
 * Même convention que `/missions/$id`/`/accounts/$id` : le paramètre s'appelle
 * `id`, pas `$submissionId` — c'est ce que `ObjectMention` (primitive F1)
 * attend pour ouvrir n'importe quel objet sans table de correspondance par
 * type. Aucune route `routes/submissions.tsx` n'existe (la liste vit dans le Vivier,
 * `routes/consultants/index.tsx`, section « Positionnements ») : pas de tiret bas ici, cette route ne
 * s'imbrique sous rien.
 */
export const Route = createFileRoute('/submissions/$id')({
  component: SubmissionDossierRoute,
})

function SubmissionDossierRoute() {
  const { id } = Route.useParams()
  return <SubmissionDossierPage submissionId={id} />
}

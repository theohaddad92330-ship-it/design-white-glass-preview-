import { createFileRoute } from '@tanstack/react-router'
import { AutomationEditorPage } from '@/features/automations/view/AutomationEditorPage'

/**
 * Théo C automations-editeur — `/actions/automatisations/:id` : « Ajuster ton automatisation ».
 *
 * Tiret bas requis (même convention que `automatisations_/bibliotheque.tsx`) : `automatisations.tsx` redirige.
 */
export const Route = createFileRoute('/actions/automatisations_/$id')({
  component: AutomationEditorRoute,
})

function AutomationEditorRoute() {
  const { id } = Route.useParams()
  return <AutomationEditorPage id={id} />
}

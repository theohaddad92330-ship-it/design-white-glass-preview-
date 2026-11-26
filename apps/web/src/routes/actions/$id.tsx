import { createFileRoute, redirect } from '@tanstack/react-router'
import { ActionHistoryDetailPage } from '@/features/action-history/view/ActionHistoryDetailPage'

export const Route = createFileRoute('/actions/$id')({
  // #5028 — `/actions/ecritures` n'est plus une page : la file des écritures CRM vit dans le Centre d'actions.
  // Sans cette garde, « ecritures » était lu comme un identifiant (« Action introuvable », recette prod 01/11).
  beforeLoad: ({ params }) => {
    if (params.id === 'ecritures') throw redirect({ to: '/actions' })
  },
  component: ActionHistoryDetailRoute,
})

function ActionHistoryDetailRoute() {
  return <ActionHistoryDetailPage />
}

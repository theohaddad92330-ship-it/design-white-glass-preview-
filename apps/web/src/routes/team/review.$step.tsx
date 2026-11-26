import { createFileRoute } from '@tanstack/react-router'
import { CustomerPage } from '@/components/page/CustomerPage'
import { RedirectTo } from '@/components/navigation/RedirectTo'
import { PlanFeatureRoute } from '@/features/plan-features/PlanFeatureRoute'
import { TeamReviewPage } from '@/features/manager/view/TeamReviewPage'
import { useTeam } from '@/features/team/hooks/useTeam'

export const Route = createFileRoute('/team/review/$step')({
  component: TeamReviewRoute,
})

/**
 * Théo D team-review — `/team/review/1|2|3` : les sujets, les décisions, la
 * relecture. Même porte que `/team` : un espace solo n'a pas de point d'équipe
 * (→ l’état vide de /team), et le cockpit est une surface de palier. Une étape
 * hors 1-3 ramène à la première.
 */
function TeamReviewRoute() {
  const { step } = Route.useParams()
  const { team } = useTeam()
  if (team && team.workspace.memberCount < 2) return <RedirectTo to="/team" />
  if (step !== '1' && step !== '2' && step !== '3') return <RedirectTo to="/team/review/1" />
  return (
    <CustomerPage titleInScreen>
      <PlanFeatureRoute feature="manager_cockpit">
        <TeamReviewPage urlStep={step} />
      </PlanFeatureRoute>
    </CustomerPage>
  )
}

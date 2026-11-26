import { createFileRoute } from '@tanstack/react-router'
import { CustomerPage } from '@/components/page/CustomerPage'
import { PlanFeatureRoute } from '@/features/plan-features/PlanFeatureRoute'
import { TeamResearchView } from '@/features/team-research/view/TeamResearchView'

export const Route = createFileRoute('/team/recherches')({
  component: TeamResearchRoute,
})

function TeamResearchRoute() {
  return (
    <CustomerPage titleInScreen>
      <PlanFeatureRoute feature="manager_cockpit">
        <TeamResearchView />
      </PlanFeatureRoute>
    </CustomerPage>
  )
}

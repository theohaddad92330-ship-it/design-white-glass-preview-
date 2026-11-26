import { createFileRoute } from '@tanstack/react-router'
import { CustomerPage } from '@/components/page/CustomerPage'
import { PlanFeatureRoute } from '@/features/plan-features/PlanFeatureRoute'
import { TeamActivityView } from '@/features/team-activity/view/TeamActivityView'

export const Route = createFileRoute('/team/activite')({
  // `?vue=echanges` ouvre directement les échanges d'équipe (lien depuis une mention) ; sinon le journal.
  validateSearch: (search: Record<string, unknown>): { vue?: 'echanges' } =>
    search.vue === 'echanges' ? { vue: 'echanges' } : {},
  component: TeamActivityRoute,
})

function TeamActivityRoute() {
  const { vue } = Route.useSearch()
  return (
    <CustomerPage titleInScreen>
      <PlanFeatureRoute feature="manager_cockpit">
        <TeamActivityView initialTab={vue === 'echanges' ? 'discussions' : 'journal'} />
      </PlanFeatureRoute>
    </CustomerPage>
  )
}

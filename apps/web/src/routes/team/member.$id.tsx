import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { PlanFeatureRoute } from '@/features/plan-features/PlanFeatureRoute'
import { TeamMemberPage } from '@/features/manager/team/TeamMemberPage'

// Théo D team-member.N1 — la fiche d'un membre, une route par personne. Tout membre la lit (Q3).
export const Route = createFileRoute('/team/member/$id')({
  component: TeamMemberRoute,
})

function TeamMemberRoute() {
  const { t } = useTranslation('manager')
  const { id } = Route.useParams()
  return (
    <CustomerPage titleInScreen pageTitle={t('team.member.pageTitle')}>
      <PlanFeatureRoute feature="manager_cockpit">
        <TeamMemberPage memberId={id} />
      </PlanFeatureRoute>
    </CustomerPage>
  )
}

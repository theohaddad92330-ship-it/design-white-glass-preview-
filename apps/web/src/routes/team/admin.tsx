import { createFileRoute } from '@tanstack/react-router'
import { CustomerPage } from '@/components/page/CustomerPage'
import { PlanFeatureRoute } from '@/features/plan-features/PlanFeatureRoute'
import { TeamAdminView } from '@/features/team-admin/view/TeamAdminView'

export const Route = createFileRoute('/team/admin')({
  // `?onglet=droits|regles` ouvre directement un onglet (lien depuis Réglages) ; sinon les membres.
  validateSearch: (search: Record<string, unknown>): { onglet?: 'droits' | 'regles' } =>
    search.onglet === 'droits' || search.onglet === 'regles' ? { onglet: search.onglet } : {},
  component: TeamAdminRoute,
})

function TeamAdminRoute() {
  const { onglet } = Route.useSearch()
  return (
    <CustomerPage titleInScreen>
      <PlanFeatureRoute feature="manager_cockpit">
        <TeamAdminView {...(onglet ? { initialTab: onglet } : {})} />
      </PlanFeatureRoute>
    </CustomerPage>
  )
}

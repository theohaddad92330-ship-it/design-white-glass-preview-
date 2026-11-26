import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { RedirectTo } from '@/components/navigation/RedirectTo'
import { PlanFeatureRoute } from '@/features/plan-features/PlanFeatureRoute'
import { useTeam } from '@/features/team/hooks/useTeam'
import { TeamBusinessPage, type TeamBusinessView } from '@/features/manager/team/TeamBusinessPage'
import { teamSectionTabs } from '@/features/manager/team/team-tabs'

const VIEWS: readonly TeamBusinessView[] = ['objectives', 'deals', 'portfolio']

// Théo D team-business.R1-R3 — Équipe › Objectifs & affaires : trois sous-vues dans l'URL (`?vue=`).
export const Route = createFileRoute('/team/business')({
  validateSearch: (search: Record<string, unknown>): { vue?: TeamBusinessView } => ({
    vue: VIEWS.find(v => v === search.vue),
  }),
  component: TeamBusinessRoute,
})

function TeamBusinessRoute() {
  const { t } = useTranslation('manager')
  const { team } = useTeam()
  const { vue } = Route.useSearch()
  const navigate = useNavigate({ from: '/team/business' })
  // Même règle que /team : un espace solo n'a pas de cockpit d'équipe.
  if (team && team.workspace.memberCount < 2) return <RedirectTo to="/settings/team" />
  return (
    <CustomerPage titleInScreen pageTitle={t('team.business.title')} tabs={teamSectionTabs(t)} activeTab="business">
      <PlanFeatureRoute feature="manager_cockpit">
        <TeamBusinessPage view={vue ?? 'objectives'} onViewChange={next => void navigate({ search: { vue: next } })} />
      </PlanFeatureRoute>
    </CustomerPage>
  )
}

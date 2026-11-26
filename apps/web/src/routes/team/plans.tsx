import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { RedirectTo } from '@/components/navigation/RedirectTo'
import { PlanFeatureRoute } from '@/features/plan-features/PlanFeatureRoute'
import { useTeam } from '@/features/team/hooks/useTeam'
import { TeamPlansPage, type TeamPlansLayout, type TeamPlansStatus } from '@/features/manager/team/TeamPlansPage'
import { teamSectionTabs } from '@/features/manager/team/team-tabs'

const STATUSES: readonly TeamPlansStatus[] = ['todo', 'overdue', 'today', 'delegated', 'all']
const LAYOUTS: readonly TeamPlansLayout[] = ['list', 'split', 'week']

// Théo D team-plans.R1-R3 — Équipe › Plans & actions : filtre d'état et mode d'affichage dans l'URL.
export const Route = createFileRoute('/team/plans')({
  validateSearch: (search: Record<string, unknown>): { etat?: TeamPlansStatus; mode?: TeamPlansLayout } => ({
    etat: STATUSES.find(v => v === search.etat),
    mode: LAYOUTS.find(v => v === search.mode),
  }),
  component: TeamPlansRoute,
})

function TeamPlansRoute() {
  const { t } = useTranslation('manager')
  const { team } = useTeam()
  const { etat, mode } = Route.useSearch()
  const navigate = useNavigate({ from: '/team/plans' })
  if (team && team.workspace.memberCount < 2) return <RedirectTo to="/settings/team" />
  return (
    <CustomerPage titleInScreen pageTitle={t('team.plans.title')} tabs={teamSectionTabs(t)} activeTab="plans">
      <PlanFeatureRoute feature="manager_cockpit">
        <TeamPlansPage
          status={etat ?? 'todo'}
          layout={mode ?? 'list'}
          onStatusChange={next => void navigate({ search: prev => ({ ...prev, etat: next }) })}
          onLayoutChange={next => void navigate({ search: prev => ({ ...prev, mode: next }) })}
        />
      </PlanFeatureRoute>
    </CustomerPage>
  )
}

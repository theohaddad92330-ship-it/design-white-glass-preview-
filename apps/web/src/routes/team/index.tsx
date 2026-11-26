import { createFileRoute } from '@tanstack/react-router'
import { type ManagerPeriodDays, parseManagerPeriodDays } from '@bellum/contracts'
import { parseTeamTab, type TeamSubtab, type TeamTab } from '@/features/manager/lib/team-tabs'
import { CustomerPage } from '@/components/page/CustomerPage'
import { ManagerDashboardPage } from '@/features/manager/view/ManagerDashboardPage'
import { TeamSoloState } from '@/features/manager/view/TeamSoloState'
import { TeamMemberView } from '@/features/manager/view/team-equipe/TeamMemberView'
import { TeamPlansView } from '@/features/manager/view/team-equipe/TeamPlansView'
import { TeamSearchesView } from '@/features/manager/view/team-equipe/TeamSearchesView'
import { TodayTeamReturn } from '@/features/briefing/view/TodayTeamReturn'
import { PlanFeatureRoute } from '@/features/plan-features/PlanFeatureRoute'
import { useTeam } from '@/features/team/hooks/useTeam'

type TeamVue = 'plans' | 'recherches'

export const Route = createFileRoute('/team/')({
  // #4158.37 — UNE période pour toute la page, dans l'URL (`?periode=7|30|90`).
  // Optionnelle : un lien vers `/team` n'a pas à la fournir (défaut 7 j), et une
  // valeur trafiquée retombe sur 7 j plutôt que de casser la route.
  //
  // Théo D — `onglet` et `sous` : les six onglets de l'espace Équipe et leurs sous-onglets
  // vivent dans l'adresse, sans route neuve (voir `features/manager/lib/team-tabs`).
  // Théo D team-plans / team-recherches / team-member — `?vue=plans|recherches`
  // et `?membre=<id>` sont des ÉTATS de /team, pas des routes.
  validateSearch: (
    search: Record<string, unknown>,
  ): { periode?: ManagerPeriodDays; onglet?: TeamTab; sous?: TeamSubtab; vue?: TeamVue; membre?: string } => ({
    ...(search.periode === undefined ? {} : { periode: parseManagerPeriodDays(search.periode) }),
    ...(search.onglet === undefined ? {} : { onglet: parseTeamTab(search.onglet) }),
    ...(typeof search.sous === 'string' ? { sous: search.sous as TeamSubtab } : {}),
    ...(search.vue === 'plans' || search.vue === 'recherches' ? { vue: search.vue } : {}),
    ...(typeof search.membre === 'string' && search.membre.length > 0 ? { membre: search.membre } : {}),
  }),
  component: TeamRoute,
})

function TeamRoute() {
  const { team } = useTeam()
  const { vue, membre } = Route.useSearch()
  // #4158.10 → Théo A today-equipe.A1 — un espace solo n'a pas de cockpit
  // d'équipe, mais l'onglet reste visible : il dit pourquoi il est vide et mène à
  // l'invitation (au lieu de renvoyer, sans un mot, vers Réglages › Équipe).
  // Tant que l'équipe n'est pas chargée, on ne décide pas (aucun clignotement).
  if (team && team.workspace.memberCount < 2) {
    return (
      <CustomerPage titleInScreen>
        {/* Refonte Théo (a/today-equipe) — l'entrée depuis « Aujourd'hui », et son retour. */}
        <TodayTeamReturn />
        <TeamSoloState />
      </CustomerPage>
    )
  }
  return (
    <CustomerPage titleInScreen>
      <TodayTeamReturn />
      <PlanFeatureRoute feature="manager_cockpit">
        {membre ? (
          <TeamMemberView memberId={membre} />
        ) : vue === 'plans' ? (
          <TeamPlansView />
        ) : vue === 'recherches' ? (
          <TeamSearchesView />
        ) : (
          <ManagerDashboardPage />
        )}
      </PlanFeatureRoute>
    </CustomerPage>
  )
}

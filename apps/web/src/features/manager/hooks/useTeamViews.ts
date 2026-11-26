import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateObjectiveProposal, UpdateActionPlanItem } from '@bellum/contracts'
import { planItemsApi } from '@/features/actions/planItems.api'
import { useSession } from '@/lib/hooks/use-session'
import { managerApi, objectiveKeys, objectiveProposalsApi, teamViewKeys } from '../api'

/** Théo D team-business — objectifs du mois, affaires ouvertes, portefeuille (direction). */
export function useTeamBusiness() {
  const { user } = useSession()
  return useQuery({
    queryKey: teamViewKeys.business(user?.id),
    queryFn: () => managerApi.teamBusiness(),
    enabled: !!user,
    staleTime: 60_000,
  })
}

/** Théo D team-plans — les actions ouvertes de l'équipe (direction). */
export function useTeamPlans() {
  const { user } = useSession()
  return useQuery({
    queryKey: teamViewKeys.plans(user?.id),
    queryFn: () => managerApi.teamPlans(),
    enabled: !!user,
    staleTime: 30_000,
  })
}

/** Théo D team-member — la fiche d'un membre (tout membre peut la lire). */
export function useTeamMember(memberId: string) {
  const { user } = useSession()
  return useQuery({
    queryKey: teamViewKeys.member(user?.id, memberId),
    queryFn: () => managerApi.member(memberId),
    enabled: !!user && memberId !== '',
    staleTime: 60_000,
  })
}

/** La direction propose une cible à un membre : la cible actuelle ne bouge pas avant sa réponse. */
export function useProposeObjective() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateObjectiveProposal) => objectiveProposalsApi.propose(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['manager'] })
    },
  })
}

/** Mes propositions de cible en attente. */
export function useMyObjectiveProposals() {
  const { user } = useSession()
  return useQuery({
    queryKey: teamViewKeys.proposalsMine(user?.id),
    queryFn: () => objectiveProposalsApi.mine(),
    enabled: !!user,
    staleTime: 60_000,
  })
}

/** Le membre accepte ou refuse une proposition ; accepter met à jour son objectif. */
export function useRespondToProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'accepted' | 'refused' }) =>
      objectiveProposalsApi.respond(id, decision),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['manager'] })
      void queryClient.invalidateQueries({ queryKey: objectiveKeys.all })
    },
  })
}

/** Théo D team-plans — créer une action pour un compte (et la confier si le responsable est un autre membre). */
export function useCreateTeamAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      accountId: string
      label: string
      reason: string
      expectedOutcome: string
      dueDate: string | null
      assignedTo: string | null
      currentUserId: string | null
    }) => {
      const created = await planItemsApi.create({
        account_id: input.accountId,
        label: input.label,
        target: null,
        reason: input.reason,
        expected_outcome: input.expectedOutcome,
        due_date: input.dueDate,
      })
      // Confier à un AUTRE membre : la note de contexte est la raison saisie, jamais inventée.
      if (input.assignedTo && input.assignedTo !== input.currentUserId) {
        await planItemsApi.update(created.id, { assigned_to: input.assignedTo, handoff_note: input.reason })
      }
      return created
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['manager'] })
    },
  })
}

/** Théo D team-plans — changer le responsable et/ou l'échéance d'une action, après confirmation. */
export function useUpdateTeamAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateActionPlanItem }) => planItemsApi.update(id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['manager'] })
    },
  })
}

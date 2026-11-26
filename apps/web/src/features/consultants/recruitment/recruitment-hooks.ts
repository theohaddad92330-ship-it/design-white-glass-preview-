import type { ChangeRecruitmentStage, RecruitmentColumn } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'

const recruitmentKeys = {
  board: () => ['talent-recruitment', 'board'] as const,
}

/** Les cinq colonnes du kanban Recrutement, vides comprises. */
export function useRecruitmentBoard() {
  return useQuery({
    queryKey: recruitmentKeys.board(),
    queryFn: async () => {
      const response = await apiFetch<{ columns: RecruitmentColumn[] }>({ path: '/talent-recruitment' })
      return response.columns
    },
    retry: false,
  })
}

/** Change l'étape d'une personne : le kanban se relit, rien d'autre ne bouge. */
export function useChangeRecruitmentStage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ talentId, input }: { talentId: string; input: ChangeRecruitmentStage }) =>
      apiFetch<{ id: string }, ChangeRecruitmentStage>({
        path: `/talent-recruitment/${talentId}`,
        method: 'PUT',
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recruitmentKeys.board() })
    },
    onError: () => {
      toast.error(i18n.t('consultants:recruitment.saveError'))
    },
  })
}

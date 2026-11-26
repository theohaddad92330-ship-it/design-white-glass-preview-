import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { MemberPortfolio, PortfolioHandoverResult } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { teamApi } from '../api'
import { TEAM_KEY } from './useTeam'

export const MEMBER_PORTFOLIO_KEY = (userId: string) => ['member-portfolio', userId] as const

/**
 * Ce qu'un membre porte, et le geste qui le transmet — la sortie d'un
 * utilisateur (tome 8 §33, angle mort n°2).
 *
 * La lecture n'est PAS mise en cache longtemps (`staleTime: 0`) : elle sert à
 * décider d'un geste irréversible, et un compte de comptes vieux de cinq
 * minutes n'est pas une prévisualisation, c'est un souvenir.
 *
 * `enabled` suit l'ouverture de la boîte de dialogue : la liste des membres ne
 * doit pas déclencher un appel par ligne.
 */
export function useMemberPortfolio(userId: string | null, enabled: boolean) {
  const qc = useQueryClient()

  const portfolio = useQuery<MemberPortfolio>({
    queryKey: MEMBER_PORTFOLIO_KEY(userId ?? ''),
    queryFn: () => teamApi.getMemberPortfolio(userId as string),
    enabled: enabled && !!userId,
    staleTime: 0,
    retry: false,
  })

  const handOver = useMutation<PortfolioHandoverResult, Error, string>({
    mutationFn: toUserId => teamApi.handOverPortfolio(userId as string, toUserId),
    onSuccess: () => {
      toast.success(i18n.t('team:handover.toast.done'))
      // L'équipe ET le portefeuille du membre ont bougé : les deux se relisent.
      void qc.invalidateQueries({ queryKey: TEAM_KEY })
      void qc.invalidateQueries({ queryKey: MEMBER_PORTFOLIO_KEY(userId ?? '') })
    },
    onError: error => toast.error(error.message || i18n.t('team:handover.toast.failed')),
  })

  return { portfolio, handOver }
}

import type { SetBetProfileRequest } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi } from '@/features/accounts/api'

/**
 * #3245 (#3209.6) — le profil de pari DÉCLARÉ d'un compte (horizon, taille,
 * accès, ressource). Il alimente la répartition « où investir mon temps »
 * de Laura : `get_portfolio_priorities` ne nomme un déséquilibre que sur ce
 * que le commercial a déclaré ici, jamais sur une estimation.
 */
export function useBetProfile(accountId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: accountKeys.betProfile(accountId ?? ''),
    queryFn: () => accountsApi.getBetProfile(accountId as string),
    enabled: enabled && Boolean(accountId),
  })
}

/** #3245 — la liste des dossiers et de ce qui en est déclaré (écran Réglages). */
export function useBetProfiles() {
  return useQuery({ queryKey: accountKeys.betProfiles(), queryFn: () => accountsApi.listBetProfiles() })
}

/** Geste HUMAIN auto-approuvé : le clic EST la déclaration. */
export function useSetBetProfile() {
  const qc = useQueryClient()
  return useMutation<
    { id: string } & SetBetProfileRequest,
    Error,
    { id: string; profile: SetBetProfileRequest; companyName?: string | null }
  >({
    mutationKey: ['accounts', 'bet-profile'],
    mutationFn: ({ id, profile }) => accountsApi.setBetProfile(id, profile),
    onSuccess: (_result, { id, companyName }) => {
      qc.invalidateQueries({ queryKey: accountKeys.betProfile(id) })
      qc.invalidateQueries({ queryKey: accountKeys.betProfiles() })
      toast.success(
        i18n.t('accounts:betProfile.savedToast', { company: companyName || i18n.t('accounts:table.thisAccount') }),
      )
    },
    onError: error => {
      toast.error(i18n.t('accounts:betProfile.errorToast'), { description: error.message })
    },
  })
}

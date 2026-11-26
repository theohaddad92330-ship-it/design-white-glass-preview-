import type { CommitteeEntryLevel } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi } from '@/features/accounts/api'

/**
 * #3282 / #3263.30 — le niveau d'entrée du comité d'achat, SAISI par le
 * commercial dans une liste fermée. « Trop haut » (onglet Comité) se calcule
 * sur cette valeur ; `null` = non précisé, donc rien n'est signalé.
 */
export function useCommitteeEntryLevel(accountId: string | undefined) {
  return useQuery({
    queryKey: accountKeys.committeeEntryLevel(accountId ?? ''),
    queryFn: () => accountsApi.getCommitteeEntryLevel(accountId as string),
    enabled: Boolean(accountId),
  })
}

/** Geste HUMAIN auto-approuvé : le choix EST la déclaration. */
export function useSetCommitteeEntryLevel(accountId: string) {
  const qc = useQueryClient()
  return useMutation<{ id: string; level: CommitteeEntryLevel | null }, Error, CommitteeEntryLevel | null>({
    mutationKey: ['accounts', 'committee-entry-level', accountId],
    mutationFn: level => accountsApi.setCommitteeEntryLevel(accountId, level),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountKeys.committeeEntryLevel(accountId) })
    },
    onError: error => {
      toast.error(i18n.t('accountOrg:committeeScreen.entryLevel.errorToast'), { description: error.message })
    },
  })
}

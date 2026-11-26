import { DEFAULT_MAX_RECRUITERS_SHOWN, type UpdateReverseMarketSettings } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { reverseMarketSettingsApi } from '../lib/reverse-market-settings-api'

const REVERSE_MARKET_SETTINGS_KEY = ['settings', 'reverse-market'] as const

/**
 * `#2035.10` — la lecture ET l'écriture des trois réglages du marché inversé,
 * derrière un seul hook, comme `useMarginThreshold`.
 *
 * ⚠️ #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes.
 * Il y avait deux hooks pour ce sujet (`useReverseMarketSettings` pour le
 * nombre de recruteurs, `useReverseMarketCapacitySettings` pour l'activation et
 * la capacité) sur deux routes différentes. Un seul reste (GA-26).
 *
 * Les défauts viennent du contrat partagé, jamais d'un littéral recopié ici :
 * `responseCapacityPerWeek` reste `null` — « non renseignée », jamais zéro
 * (GA-18/GA-19) — tandis que `maxRecruitersShown` a toujours une valeur, celle
 * du produit tant que l'espace n'a rien réglé.
 */
export function useReverseMarketSettings() {
  const { t } = useTranslation('reverseMarketSettings')
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: REVERSE_MARKET_SETTINGS_KEY,
    queryFn: () => reverseMarketSettingsApi.get(),
    retry: false,
    staleTime: 0,
  })

  const save = useMutation({
    mutationFn: (patch: UpdateReverseMarketSettings) => reverseMarketSettingsApi.update(patch),
    onSuccess: result => {
      queryClient.setQueryData(REVERSE_MARKET_SETTINGS_KEY, result)
      toast.success(t('saved'))
    },
    onError: () => toast.error(t('saveFailed')),
  })

  return {
    enabled: query.data?.enabled ?? false,
    responseCapacityPerWeek: query.data?.responseCapacityPerWeek ?? null,
    maxRecruitersShown: query.data?.maxRecruitersShown ?? DEFAULT_MAX_RECRUITERS_SHOWN,
    isLoading: query.isLoading,
    isError: query.isError,
    save: (patch: UpdateReverseMarketSettings) => save.mutate(patch),
    saving: save.isPending,
  }
}

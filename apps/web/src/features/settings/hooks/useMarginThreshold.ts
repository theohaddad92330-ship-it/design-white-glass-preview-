import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { marginThresholdApi } from '../lib/margin-threshold-api'

const MARGIN_THRESHOLD_KEY = ['settings', 'margin-threshold'] as const

/**
 * #2420.17 — la lecture ET l'écriture du seuil d'alerte de marge, derrière un
 * seul hook : le formulaire des Réglages n'invente pas de second calcul, il
 * appelle les routes existantes (`marginThresholdApi`).
 *
 * `enabled` porte le droit de LIRE (`finance:read` ou `finance:read:own`) —
 * sans lui, l'appel n'est même pas tenté : un membre qui n'a ni l'un ni
 * l'autre reçoit un 403 côté serveur, et ce hook ne doit pas le provoquer.
 */
export function useMarginThreshold(enabled: boolean) {
  const { t } = useTranslation('financeSettings')
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: MARGIN_THRESHOLD_KEY,
    queryFn: () => marginThresholdApi.get(),
    enabled,
    retry: false,
    staleTime: 0,
  })

  const save = useMutation({
    mutationFn: (thresholdPercent: number | null) => marginThresholdApi.set(thresholdPercent),
    onSuccess: result => {
      queryClient.setQueryData(MARGIN_THRESHOLD_KEY, { threshold: result.thresholdPercent })
      toast.success(t('saved'))
    },
    onError: () => toast.error(t('saveFailed')),
  })

  return {
    // `undefined` (jamais chargé) ET `null` (chargé, mais éteint) se distinguent :
    // le premier ne doit rien afficher tant que `isLoading` est vrai.
    threshold: query.data?.threshold ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    save: (value: number | null) => save.mutate(value),
    saving: save.isPending,
  }
}

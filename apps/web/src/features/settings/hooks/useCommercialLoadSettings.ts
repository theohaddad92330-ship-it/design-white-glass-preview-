import { DEFAULT_MAX_OPEN_NEEDS, type UpdateCommercialLoadSettings } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { commercialLoadSettingsApi } from '../lib/commercial-load-settings-api'

const COMMERCIAL_LOAD_SETTINGS_KEY = ['settings', 'commercial-load'] as const

/**
 * `#2035.11` — la lecture ET l'écriture des deux plafonds de charge
 * commerciale, un seul hook.
 *
 * ⚠️ #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes.
 * Deux hooks écrivaient le MÊME plafond de besoins ouverts sur deux routes
 * différentes. Un seul reste (GA-26).
 *
 * `maxTrackedAccounts` reste `null` quand rien n'est réglé — « non renseigné »,
 * jamais zéro dossier (GA-18/GA-19). `maxOpenNeeds` a toujours une valeur :
 * celle de l'espace, ou le défaut du produit.
 */
export function useCommercialLoadSettings() {
  const { t } = useTranslation('commercialLoadSettings')
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: COMMERCIAL_LOAD_SETTINGS_KEY,
    queryFn: () => commercialLoadSettingsApi.get(),
    retry: false,
    staleTime: 0,
  })

  const save = useMutation({
    mutationFn: (patch: UpdateCommercialLoadSettings) => commercialLoadSettingsApi.update(patch),
    onSuccess: result => {
      queryClient.setQueryData(COMMERCIAL_LOAD_SETTINGS_KEY, result)
      toast.success(t('saved'))
    },
    onError: () => toast.error(t('saveFailed')),
  })

  return {
    maxTrackedAccounts: query.data?.maxTrackedAccounts ?? null,
    maxOpenNeeds: query.data?.maxOpenNeeds ?? DEFAULT_MAX_OPEN_NEEDS,
    // #3245 (reste de #3209.3) — même convention : NULL = non renseigné,
    // jamais 0 heure (GA-18/GA-19).
    weeklyAvailableHours: query.data?.weeklyAvailableHours ?? null,
    // #3289.29 — le jour imposé aux relances : null = non renseigné.
    cadenceWeekday: query.data?.cadenceWeekday ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    save: (patch: UpdateCommercialLoadSettings) => save.mutate(patch),
    saving: save.isPending,
  }
}

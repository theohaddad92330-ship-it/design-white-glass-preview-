import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ActionLevelSetting } from '@bellum/contracts'
import { actionsApi } from '@/features/actions/api'
import { memoryKeys } from '@/features/memory/api'
import { i18n } from '@/i18n'
import { useSession } from '@/lib/hooks/use-session'

const ACTION_LEVEL_KEY = ['actions', 'level'] as const

/**
 * #2896 / #2449.34-.36 — le niveau d'action RÉGLÉ par l'utilisateur, UNE lecture
 * partagée par les trois endroits qui l'affichent (Réglages › Laura, la carte
 * d'une proposition, sa prévisualisation). Un seul cache : régler le niveau
 * change aussitôt ce que disent les cartes déjà ouvertes.
 */
export function useActionLevel() {
  const { user } = useSession()
  return useQuery<ActionLevelSetting>({
    queryKey: ACTION_LEVEL_KEY,
    queryFn: () => actionsApi.getLevel(),
    enabled: !!user,
    staleTime: 60_000,
  })
}

/**
 * Régler SON niveau. Invalide aussi la mémoire : le niveau vit dans le sac de
 * préférences que Réglages › Mémoire liste (et permet d'oublier).
 */
export function useSetActionLevel() {
  const qc = useQueryClient()
  return useMutation<ActionLevelSetting, Error, ActionLevelSetting>({
    mutationKey: ['actions', 'setLevel'],
    mutationFn: setting => actionsApi.setLevel(setting),
    onSuccess: setting => {
      qc.setQueryData(ACTION_LEVEL_KEY, setting)
      qc.invalidateQueries({ queryKey: memoryKeys.all })
      toast.success(i18n.t('actions:actionLevel.setting.saved'))
    },
    onError: () => toast.error(i18n.t('actions:actionLevel.setting.saveFailed')),
  })
}

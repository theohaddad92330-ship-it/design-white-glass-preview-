import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Activity, ActivityKind, ActivityScope, ActivitySyncResult, LogActivityInput } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { activitiesApi, activityKeys } from '../api'

/** La timeline d'un objet, du plus récent au plus ancien. */
export function useTimeline(scope: ActivityScope, entityId: string | undefined, kind?: ActivityKind) {
  return useQuery({
    queryKey: activityKeys.timeline(scope, entityId ?? 'none', kind),
    queryFn: () => activitiesApi.timeline(scope, entityId as string, kind),
    enabled: Boolean(entityId),
    // FRAÎCHEUR IMMÉDIATE, contre le défaut global de 5 minutes.
    //
    // Le cache de requêtes est persisté ET frais 5 min par défaut : sur un
    // historique, cela veut dire qu'un échange noté par un collègue — ou par
    // soi-même depuis un autre onglet — reste invisible cinq minutes. Sur cet
    // écran-là, c'est ce qui fait noter deux fois le même appel. Vu en recette
    // le 17/08 : deux activités écrites, l'écran affichait « aucun échange ».
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

export function useLogActivity(scope: ActivityScope, entityId: string) {
  const qc = useQueryClient()
  return useMutation<Activity, Error, LogActivityInput>({
    mutationFn: input => activitiesApi.log(input),
    onSuccess: () => {
      // Toutes les vues de cet objet, quel que soit le filtre de nature :
      // n'invalider que la clé courante laisserait la ligne absente dès qu'on
      // change d'onglet.
      qc.invalidateQueries({ queryKey: ['activities', scope, entityId] })
      toast.success(i18n.t('activities:log.saved'))
    },
    onError: () => toast.error(i18n.t('activities:log.error')),
  })
}

/** Retirer une saisie faite par erreur (activités MANUELLES, par leur auteur). */
export function useRemoveActivity(scope: ActivityScope, entityId: string) {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string }>({
    mutationFn: ({ id }) => activitiesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities', scope, entityId] })
      toast.success(i18n.t('activities:log.removed'))
    },
    onError: () => toast.error(i18n.t('activities:log.removeError')),
  })
}

/**
 * Va chercher ce que les outils connectés savent déjà.
 *
 * Le message de fin DIT ce qui est entré et ce qui n'a pas pu être lu : une
 * capture qui rend zéro parce qu'un agenda n'a pas répondu ne doit pas se lire
 * « il ne s'est rien passé ».
 */
export function useSyncActivities(scope: ActivityScope, entityId: string) {
  const qc = useQueryClient()
  return useMutation<ActivitySyncResult, Error, { windowDays?: number } | void>({
    mutationFn: input => activitiesApi.sync(input?.windowDays),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: ['activities', scope, entityId] })
      const blocked = result.sources.filter(source => source.unavailable !== null)
      if (result.ingested > 0) {
        toast.success(i18n.t('activities:sync.done', { count: result.ingested }))
      } else if (blocked.length === result.sources.length) {
        toast.warning(i18n.t('activities:sync.noSource'))
      } else {
        toast.info(i18n.t('activities:sync.nothingNew'))
      }
    },
    onError: () => toast.error(i18n.t('activities:sync.error')),
  })
}

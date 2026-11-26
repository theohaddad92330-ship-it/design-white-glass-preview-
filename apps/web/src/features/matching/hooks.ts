import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MatchExplanation, MatchRun, NeedAutoMatch, Shortlist } from '@bellum/contracts'
import { matchingApi } from './api'

/**
 * Lancer un matching est une MUTATION, pas une lecture.
 *
 * Le geste écrit un journal — c'est une obligation de conformité, pas un effet
 * de bord — et il doit rester déclenché par l'utilisateur. Le monter en `useQuery`
 * le relancerait à chaque remontage de l'écran, et remplirait le journal
 * d'exécutions que personne n'a demandées.
 */
export function useRunMatch() {
  return useMutation<MatchRun, Error, string>({ mutationFn: needId => matchingApi.run(needId) })
}

/**
 * #2916 / #2399.2 (`c93_matching_auto_besoin_entrant`) — le matching que la
 * routine « Matcher un besoin entrant » a écrit à l'arrivée du besoin. Une
 * LECTURE (`useQuery`), contrairement à `useRunMatch` : elle ne relance rien,
 * elle lit ce qui a déjà été écrit. Tant que le run est en file, elle se
 * relit seule toutes les cinq secondes — l'issue arrive sans geste.
 */
export function useNeedAutoMatch(needId: string) {
  return useQuery<NeedAutoMatch | null>({
    queryKey: ['matching', 'auto', needId],
    queryFn: async () => (await matchingApi.autoMatch(needId)).autoMatch,
    refetchInterval: query => (query.state.data?.status === 'queued' ? 5_000 : false),
  })
}

export function useShortlists(needId: string | null) {
  return useQuery<Shortlist[]>({
    queryKey: ['shortlists', needId],
    queryFn: () => matchingApi.listShortlists(needId as string),
    enabled: Boolean(needId),
  })
}

export function useCreateShortlist(needId: string | null) {
  const client = useQueryClient()
  return useMutation<Shortlist, Error, { runId: string; consultantIds: string[] }>({
    mutationFn: body => matchingApi.createShortlist(needId as string, body),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['shortlists', needId] }),
  })
}

/**
 * Le document d'explication d'UN classement (art. 86).
 *
 * Une LECTURE, contrairement au matching : la relire n'écrit rien au journal et
 * ne recalcule rien. Elle n'est demandée qu'à l'ouverture du panneau — le
 * document existe pour une personne précise, et le charger pour les quarante
 * profils d'un classement serait exactement ce que l'invariant interdit : faire
 * voyager la donnée de gens qu'on ne regarde pas.
 */
export function useMatchExplanation(needId: string, runId: string, consultantId: string | null) {
  return useQuery<MatchExplanation>({
    queryKey: ['matching', 'explain', needId, runId, consultantId],
    queryFn: () => matchingApi.explain(needId, runId, consultantId as string),
    enabled: Boolean(consultantId),
    staleTime: 60_000,
  })
}

export function useMatchWeights() {
  return useQuery({ queryKey: ['matching', 'weights'], queryFn: matchingApi.weights, staleTime: 60_000 })
}

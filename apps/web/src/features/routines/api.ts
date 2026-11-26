import type {
  NoReplyFollowUpDryRun,
  RoutineContentView,
  RoutineObservation,
  RoutineRunNowResult,
  RoutineRunView,
  RoutineView,
  UpdateRoutineRequest,
} from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export const routinesApi = {
  // #2843.30 — le contenu (gabarit) d'une routine, pour l'espace.
  content(key: string) {
    return apiFetch<RoutineContentView>({ path: `/routines/${encodeURIComponent(key)}/content` })
  },
  saveContent(key: string, template: string) {
    return apiFetch<RoutineContentView>({
      path: `/routines/${encodeURIComponent(key)}/content`,
      method: 'PUT',
      body: { template },
    })
  },
  resetContent(key: string) {
    return apiFetch<RoutineContentView>({ path: `/routines/${encodeURIComponent(key)}/content`, method: 'DELETE' })
  },
  list(): Promise<RoutineView[]> {
    return apiFetch<RoutineView[]>({ path: '/routines' })
  },
  update(key: string, body: UpdateRoutineRequest): Promise<RoutineView> {
    return apiFetch<RoutineView>({ path: `/routines/${key}`, method: 'PATCH', body })
  },
  runDue(): Promise<{ executed: number }> {
    return apiFetch<{ executed: number }>({ path: '/routines/run-due', method: 'POST' })
  },
  // #2205.49-52/.62 — l'historique d'une routine, au-delà du dernier résultat.
  runs(key: string): Promise<RoutineRunView[]> {
    return apiFetch<RoutineRunView[]>({ path: `/routines/${encodeURIComponent(key)}/runs` })
  },
  // #2843.18 — trente jours d'exécutions réelles (ni coût ni durée : back-office seul).
  observation(key: string): Promise<RoutineObservation> {
    return apiFetch<RoutineObservation>({ path: `/routines/${encodeURIComponent(key)}/observation` })
  },
  // #2843.10 — « lancer maintenant » UNE routine, hors horaire.
  runNow(key: string): Promise<RoutineRunNowResult> {
    return apiFetch<RoutineRunNowResult>({ path: `/routines/${encodeURIComponent(key)}/run-now`, method: 'POST' })
  },
  // #2398.13/#2205.38 — simulation ZÉRO écriture, pour la seule routine `no_reply_follow_up`.
  dryRunNoReplyFollowUp(): Promise<NoReplyFollowUpDryRun> {
    return apiFetch<NoReplyFollowUpDryRun>({ path: '/routines/no-reply-follow-up/dry-run' })
  },
}

export function useRoutines() {
  return useQuery({ queryKey: ['routines'], queryFn: routinesApi.list, staleTime: 30_000 })
}

/**
 * #2205.49-52/.62 — l'historique d'une routine, chargé seulement quand le
 * panneau est ouvert (`enabled`) : vingt lignes par routine cochée n'ont pas
 * à partir sur chaque chargement de l'écran des réglages.
 */
export function useRoutineRuns(key: string, enabled: boolean) {
  return useQuery({
    queryKey: ['routines', key, 'runs'],
    queryFn: () => routinesApi.runs(key),
    enabled,
    staleTime: 30_000,
  })
}

/**
 * #2398.13/#2205.38 — chargé seulement quand le panneau de simulation est
 * ouvert (`enabled`), même discipline que {@link useRoutineRuns}.
 */
export function useNoReplyFollowUpDryRun(enabled: boolean) {
  return useQuery({
    queryKey: ['routines', 'no_reply_follow_up', 'dry-run'],
    queryFn: routinesApi.dryRunNoReplyFollowUp,
    enabled,
    staleTime: 30_000,
  })
}

export function useUpdateRoutine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ key, patch }: { key: string; patch: UpdateRoutineRequest }) => routinesApi.update(key, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['routines'] })
    },
  })
}

/**
 * « Lancer celles qui sont dues » — le bouton qui évite d'attendre demain matin
 * pour vérifier qu'une routine marche. Même idempotence que le balayeur :
 * appuyer deux fois ne poste pas deux fois.
 */
export function useRunDueRoutines() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: routinesApi.runDue,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['routines'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

/** #2843.18 — trente jours d'exécutions réelles de CETTE routine. */
export function useRoutineObservation(key: string) {
  return useQuery({
    queryKey: ['routines', key, 'observation'],
    queryFn: () => routinesApi.observation(key),
    staleTime: 30_000,
  })
}

/** #2843.10 — « lancer maintenant » : rafraîchit la fiche, son historique et les notifications. */
export function useRunRoutineNow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => routinesApi.runNow(key),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['routines'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

/** #2843.30 — le gabarit de l'espace pour CETTE routine ; `template: null` = texte par défaut. */
export function useRoutineContent(key: string) {
  return useQuery({
    queryKey: ['routines', key, 'content'],
    queryFn: () => routinesApi.content(key),
    staleTime: 30_000,
  })
}

export function useSaveRoutineContent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ key, template }: { key: string; template: string }) => routinesApi.saveContent(key, template),
    onSuccess: (_data, { key }) => {
      void queryClient.invalidateQueries({ queryKey: ['routines', key, 'content'] })
    },
  })
}

export function useResetRoutineContent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => routinesApi.resetContent(key),
    onSuccess: (_data, key) => {
      void queryClient.invalidateQueries({ queryKey: ['routines', key, 'content'] })
    },
  })
}

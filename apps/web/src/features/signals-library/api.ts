import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  HISTORY_PAGE_SIZE,
  signalStatesResponseSchema,
  watchesResponseSchema,
  type SignalStateRequest,
  type SignalStatesResponse,
  type SignalUserState,
  type WatchesResponse,
  type WatchRequest,
  type SignalWatchState,
  type WorkspaceSignalHistory,
  workspaceSignalHistorySchema,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'
import { stateMapKey } from './model/signal-library'

/**
 * Théo A signaux — l'état personnel des signaux et les veilles par compte. Parsés à la frontière : une API
 * antérieure au module rend un 404, converti en échec de requête nommé plutôt qu'en écran faux.
 */
const STATES_KEY = ['signal-states'] as const
const WATCHES_KEY = ['signal-watches'] as const
/** Le cache des comptes suivis (`features/account-follows`) : une veille enregistrée peut SUIVRE ses comptes (#4506). */
const ACCOUNT_FOLLOWS_KEY = ['account-follows'] as const

/**
 * Lot 764 — l'Historique de TOUS mes comptes : la même lecture que l'onglet « Signaux et besoins » de chaque compte
 * (`GET /accounts/signal-history`), parsée à la frontière. Lue seulement quand l'onglet est ouvert.
 *
 * Lot 785 (#5213) — PAR PAGES de {@link HISTORY_PAGE_SIZE} comptes : le premier écran n'attend plus tout l'historique.
 * La recherche (`q`) est faite par le SERVEUR : changer de requête repart de la première page. `total` est celui de
 * la même requête ; une API qui ne pagine pas (pas de `page`) est lue comme complète.
 */
export function useWorkspaceSignalHistory(enabled: boolean, search = '') {
  const { user } = useSession()
  const q = search.trim()
  const query = useInfiniteQuery({
    queryKey: ['accounts', 'signal-history', user?.id, q],
    enabled: enabled && Boolean(user?.id),
    initialPageParam: 0,
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam }): Promise<WorkspaceSignalHistory> => {
      const params = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE), offset: String(pageParam) })
      if (q !== '') params.set('q', q)
      return workspaceSignalHistorySchema.parse(
        await apiFetch<unknown>({ path: `/accounts/signal-history?${params.toString()}` }),
      )
    },
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.accounts.length, 0)
      return last.page && last.accounts.length > 0 && loaded < last.page.total ? loaded : undefined
    },
  })
  const data = useMemo<WorkspaceSignalHistory | undefined>(
    () => (query.data ? { accounts: query.data.pages.flatMap(page => page.accounts) } : undefined),
    [query.data],
  )
  const total = query.data?.pages.at(-1)?.page?.total
  return { ...query, data, total }
}

/** `<compte>|<fait>` → état, la table que lit `buildSignalLibrary`. */
export function useSignalStates() {
  const { user } = useSession()
  return useQuery({
    queryKey: [...STATES_KEY, user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<SignalStatesResponse> =>
      signalStatesResponseSchema.parse(await apiFetch<unknown>({ path: '/signal-states' })),
    select: (data): ReadonlyMap<string, SignalUserState> =>
      new Map(data.items.map(item => [stateMapKey(item.account_id, item.signal_key), item.state])),
  })
}

/** Enregistrer · écarter · mettre à la corbeille · remettre (`state: null`). Rien n'est supprimé. */
export function useSetSignalStates() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (request: SignalStateRequest) => {
      await apiFetch<unknown>({ path: '/signal-states', method: 'PUT', body: request })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: STATES_KEY }),
  })
}

export function useWatches() {
  const { user } = useSession()
  return useQuery<WatchesResponse>({
    queryKey: [...WATCHES_KEY, user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => watchesResponseSchema.parse(await apiFetch<unknown>({ path: '/signal-watches' })),
  })
}

export function useSaveWatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, request }: { id: string | null; request: WatchRequest }) => {
      await apiFetch<unknown>(
        id
          ? { path: `/signal-watches/${id}`, method: 'PATCH', body: request }
          : { path: '/signal-watches', method: 'POST', body: request },
      )
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: WATCHES_KEY }),
        queryClient.invalidateQueries({ queryKey: ACCOUNT_FOLLOWS_KEY }),
      ])
    },
  })
}

/**
 * #4506 — « Ne plus suivre » depuis Mes veilles (onglet Comptes suivis, ou la modale au plafond) : le suivi est
 * ARCHIVÉ (rien n'est supprimé) et les veilles qui portaient ce compte disent « À connecter ».
 */
export function useUnfollowAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (accountId: string) => {
      await apiFetch<unknown>({ path: `/accounts/${accountId}/follow`, method: 'DELETE' })
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: WATCHES_KEY }),
        queryClient.invalidateQueries({ queryKey: ACCOUNT_FOLLOWS_KEY }),
      ])
    },
  })
}

export function useSetWatchState() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, state }: { id: string; state: SignalWatchState }) => {
      await apiFetch<unknown>({ path: `/signal-watches/${id}/state`, method: 'PATCH', body: { state } })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: WATCHES_KEY }),
  })
}

/** « Supprimer » ARCHIVE la veille : les informations déjà collectées restent. */
export function useArchiveWatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await apiFetch<unknown>({ path: `/signal-watches/${id}`, method: 'DELETE' })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: WATCHES_KEY }),
  })
}

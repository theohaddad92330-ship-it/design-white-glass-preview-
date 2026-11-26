import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  accountFactsExportResponseSchema,
  targetCandidatesResponseSchema,
  targetListItemSchema,
  targetListSchema,
  targetListsResponseSchema,
  type AddTargetListItem,
  type CreateTargetList,
  type TargetCandidate,
  type TargetList,
  type TargetListItem,
  type UpdateTargetList,
  type UpdateTargetListItem,
} from '@bellum/contracts'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #2155.13 à .21 — « Mes cibles ». Parsé à la frontière : une API antérieure au
 * module renvoie un 404 ou un corps hors contrat, converti ici en échec de
 * requête nommé plutôt qu'en page morte.
 */
/** Exporté (#2164.44) : réutilisé par `useCreateTargetFromAccount.ts` — une
 *  seule implémentation de « créer une liste » / « ajouter un élément »,
 *  jamais recopiée (GA-26). */
export const targetListsApi = {
  async list(): Promise<TargetList[]> {
    return targetListsResponseSchema.parse(await apiFetch<unknown>({ path: '/target-lists' })).lists
  },
  /** #4073.1 — les faits datés des comptes d'une liste, pour l'export. Jamais écrit, jamais deviné. */
  async accountFactsCells(accountIds: string[]) {
    return accountFactsExportResponseSchema.parse(
      await apiFetch<unknown, { accountIds: string[] }>({
        path: '/account-facts/export-cells',
        method: 'POST',
        body: { accountIds },
      }),
    ).cells
  },
  async candidates(q: string): Promise<TargetCandidate[]> {
    const path = `/target-lists/candidates?q=${encodeURIComponent(q)}`
    return targetCandidatesResponseSchema.parse(await apiFetch<unknown>({ path })).candidates
  },
  /**
   * #2156.73 — une liste naît toujours avec une action suivante : ni le
   * formulaire manuel, ni la création depuis un compte, Contacts ou Découvrir
   * n'en écrivent une. Le défaut vit ici, au seul endroit que les quatre
   * traversent déjà (GA-26) — jamais une chaîne vide n'atteint l'API.
   */
  async create(body: CreateTargetList): Promise<TargetList> {
    return targetListSchema.parse(
      await apiFetch<unknown, CreateTargetList>({
        path: '/target-lists',
        method: 'POST',
        body: { ...body, next_action: body.next_action ?? i18n.t('targets:create.defaultNextAction') },
      }),
    )
  },
  remove(listId: string): Promise<{ id: string }> {
    return apiFetch({ path: `/target-lists/${listId}`, method: 'DELETE' })
  },
  /** #2156.35-.39/.63/.65/.66 — l'écriture de LISTE existait côté API depuis le
   *  14/09 (`target-lists.controller.ts:51`) sans appelant web : c'était l'API
   *  qui manquait d'appelant, pas la fonctionnalité. */
  async updateList(listId: string, body: UpdateTargetList): Promise<TargetList> {
    return targetListSchema.parse(
      await apiFetch<unknown, UpdateTargetList>({ path: `/target-lists/${listId}`, method: 'PATCH', body }),
    )
  },
  async addItem(listId: string, body: AddTargetListItem): Promise<TargetListItem> {
    return targetListItemSchema.parse(
      await apiFetch<unknown, AddTargetListItem>({ path: `/target-lists/${listId}/items`, method: 'POST', body }),
    )
  },
  async updateItem(listId: string, itemId: string, body: UpdateTargetListItem): Promise<TargetListItem> {
    return targetListItemSchema.parse(
      await apiFetch<unknown, UpdateTargetListItem>({
        path: `/target-lists/${listId}/items/${itemId}`,
        method: 'PATCH',
        body,
      }),
    )
  },
  /** #2155.14 — retire l'élément de la liste. Aucun appel ne vise la fiche. */
  removeItem(listId: string, itemId: string): Promise<{ id: string }> {
    return apiFetch({ path: `/target-lists/${listId}/items/${itemId}`, method: 'DELETE' })
  },
}

const TARGET_LISTS_KEY = ['target-lists'] as const

export function useTargetLists() {
  const { user } = useSession()
  return useQuery<TargetList[]>({
    queryKey: [...TARGET_LISTS_KEY, user?.id],
    queryFn: targetListsApi.list,
    enabled: !!user,
    staleTime: 30_000,
  })
}

/** Les fiches de l'espace dont le nom contient `q` — rien sous deux caractères. */
export function useTargetCandidates(q: string) {
  const { user } = useSession()
  const term = q.trim()
  return useQuery<TargetCandidate[]>({
    queryKey: [...TARGET_LISTS_KEY, 'candidates', user?.id, term],
    queryFn: () => targetListsApi.candidates(term),
    enabled: !!user && term.length >= 2,
    staleTime: 30_000,
  })
}

export function useTargetListMutations() {
  const queryClient = useQueryClient()
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: TARGET_LISTS_KEY })
  return {
    createList: useMutation({ mutationFn: targetListsApi.create, onSuccess }),
    updateList: useMutation({
      mutationFn: ({ listId, body }: { listId: string; body: UpdateTargetList }) =>
        targetListsApi.updateList(listId, body),
      onSuccess,
    }),
    deleteList: useMutation({ mutationFn: targetListsApi.remove, onSuccess }),
    addItem: useMutation({
      mutationFn: ({ listId, body }: { listId: string; body: AddTargetListItem }) =>
        targetListsApi.addItem(listId, body),
      onSuccess,
    }),
    updateItem: useMutation({
      mutationFn: ({ listId, itemId, body }: { listId: string; itemId: string; body: UpdateTargetListItem }) =>
        targetListsApi.updateItem(listId, itemId, body),
      onSuccess,
    }),
    removeItem: useMutation({
      mutationFn: ({ listId, itemId }: { listId: string; itemId: string }) => targetListsApi.removeItem(listId, itemId),
      onSuccess,
    }),
  }
}

import type { CreateMcpAccessIntentInput, DecideMcpAccessIntentInput, McpAccessIntent } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

/** An AI assistant the user has authorized against their Bellum account. */
export type McpConnection = {
  id: string
  client_id: string
  client_name: string
  scope: string
  created_at: string
}

export const mcpApi = {
  listConnections: () => apiFetch<McpConnection[]>({ path: '/oauth/connections' }),
  revokeConnection: (id: string) => apiFetch<void>({ path: `/oauth/connections/${id}`, method: 'DELETE' }),
}

export const MCP_CONNECTIONS_KEY = ['mcp', 'connections'] as const

/** Public URL of the MCP server the user adds to their assistant. Unset →
 *  the feature shows "bientôt disponible" (env-gated, mirrors the API). */
export const MCP_SERVER_URL: string | undefined = import.meta.env.VITE_MCP_URL || undefined

/**
 * Théo D settings-outils.N1 — le cadre d'un nouvel accès : l'intention est écrite par un membre, tranchée par un
 * administrateur. Aucun jeton ne circule ici.
 */
const intentsKey = ['mcp', 'access-intents'] as const
const pendingKey = ['mcp', 'access-intents', 'pending'] as const

export function useMcpAccessIntents() {
  return useQuery({
    queryKey: intentsKey,
    queryFn: () => apiFetch<McpAccessIntent[]>({ path: '/mcp-access-intents' }),
    staleTime: 30_000,
  })
}

/** Les demandes en attente de tout l'espace — seulement pour qui peut les trancher (`integrations:manage`). */
export function usePendingMcpAccessIntents(enabled: boolean) {
  return useQuery({
    queryKey: pendingKey,
    queryFn: () => apiFetch<McpAccessIntent[]>({ path: '/mcp-access-intents/pending' }),
    enabled,
    staleTime: 30_000,
  })
}

export function useCreateMcpAccessIntent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateMcpAccessIntentInput) =>
      apiFetch<McpAccessIntent, CreateMcpAccessIntentInput>({ path: '/mcp-access-intents', method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: intentsKey }),
  })
}

export function useDecideMcpAccessIntent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: DecideMcpAccessIntentInput & { id: string }) =>
      apiFetch<McpAccessIntent, DecideMcpAccessIntentInput>({
        path: `/mcp-access-intents/${id}`,
        method: 'PATCH',
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: intentsKey }),
  })
}

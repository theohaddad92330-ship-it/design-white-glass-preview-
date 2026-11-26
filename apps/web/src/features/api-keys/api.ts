import { apiFetch } from '@/lib/api'

/** Workspace API keys for the public read API (`/v1/*`). Managed by the API's
 *  `api-keys` module (JWT + RBAC `integrations:manage`). The raw key value is
 *  returned by `create` ONLY — the server stores a hash, so it can never be
 *  fetched again. */
export type PublicApiScope = 'read:accounts' | 'read:contacts'

export type ApiKeySummary = {
  id: string
  name: string
  /** Displayable hint (`blm_live_xxxx`) — never the full key. */
  prefix: string
  scopes: PublicApiScope[]
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export type CreatedApiKey = ApiKeySummary & {
  /** The full key — shown exactly once, copy it now. */
  key: string
}

export const apiKeysApi = {
  list(): Promise<ApiKeySummary[]> {
    return apiFetch<ApiKeySummary[]>({ path: '/api-keys' })
  },
  create(name: string, scopes: PublicApiScope[]): Promise<CreatedApiKey> {
    return apiFetch<CreatedApiKey>({ path: '/api-keys', method: 'POST', body: { name, scopes } })
  },
  revoke(id: string): Promise<void> {
    return apiFetch<void>({ path: `/api-keys/${id}`, method: 'DELETE' })
  },
}

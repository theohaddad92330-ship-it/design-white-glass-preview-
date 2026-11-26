import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

/** Build identity of the deployed API (Théo P0 « parité release »). */
type ApiVersion = {
  commit: string
  environment: string
  timestamp: string
}

/**
 * The web build id, injected at build time by Vite from
 * `tools/get-version.sh` (format `YY.MM.DD-tsUNIX+gitSHA10`). Falls back to
 * `dev` when the define is absent (local `vite dev` without the env).
 */
export function webBuildId(): string {
  return typeof __CODE_VERSION_ID__ === 'string' && __CODE_VERSION_ID__.length > 0 ? __CODE_VERSION_ID__ : 'dev'
}

/** Extract the 10-char git SHA from a web build id, or null if absent. */
export function commitFromBuildId(buildId: string): string | null {
  const match = /\+git([a-f0-9]{7,})$/.exec(buildId)
  return match ? match[1] : null
}

/** Fetch the deployed API's commit/env so admin can confirm release parity. */
export function useApiVersion() {
  return useQuery({
    queryKey: ['build', 'api-version'] as const,
    queryFn: () => apiFetch<ApiVersion>({ path: '/version' }),
    staleTime: 5 * 60_000,
  })
}

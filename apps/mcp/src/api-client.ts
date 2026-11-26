import type { McpEnv } from './config/env.js'

export type ApiResult = { ok: true; data: unknown } | { ok: false; status: number; message: string }

/**
 * Thin proxy call to the Bellum API on behalf of the user, forwarding their MCP
 * access token as a Bearer. No business logic lives here — the API's `/mcp/*`
 * controller does the work and the workspace scoping.
 */
export async function apiRequest(
  env: McpEnv,
  token: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<ApiResult> {
  let res: Response
  try {
    res = await fetch(`${env.API_INTERNAL_URL}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    return { ok: false, status: 0, message: `Network error reaching Bellum API: ${(err as Error).message}` }
  }

  if (res.ok) {
    const data = await res.json().catch(() => null)
    return { ok: true, data }
  }

  let message = res.statusText
  try {
    const parsed = (await res.json()) as { message?: string; error?: string }
    message = parsed?.message || parsed?.error || message
  } catch {
    // non-JSON error body — keep statusText
  }
  return { ok: false, status: res.status, message }
}

/** Turn an API failure into a human-readable, non-leaky tool message. */
export function describeApiError(result: Extract<ApiResult, { ok: false }>): string {
  switch (result.status) {
    case 401:
      return 'Authentification expirée — reconnectez Bellum à votre assistant.'
    case 402:
      // Analyses (quota) or enrichissements (crédits) — the API's message says which.
      return result.message ? `Crédits insuffisants : ${result.message}` : 'Crédits insuffisants.'
    case 403:
      return `Action non autorisée : ${result.message}`
    case 404:
      return `Introuvable : ${result.message}`
    case 429:
      return 'Quota atteint (limite d’analyses). Réessayez plus tard ou vérifiez vos crédits avec get_credits.'
    default:
      return `Erreur API Bellum (${result.status}) : ${result.message}`
  }
}

import { apiBase } from '@/lib/api-origin'

/**
 * Exchange a one-time impersonation token (delivered in the URL fragment) for the
 * HttpOnly `imp_session` cookie. The token travels ONLY in the Authorization
 * header of this single call; `credentials: 'include'` lets the API set the
 * session cookies on the response. Returns whether the exchange succeeded.
 */
export async function consumeImpersonationToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase()}/auth/impersonate/consume`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    })
    return res.ok
  } catch {
    return false
  }
}

/** End the impersonation session: the API audits the stop and clears the
 *  impersonation cookies. Best-effort — the caller redirects regardless. */
export async function stopImpersonation(): Promise<void> {
  try {
    await fetch(`${apiBase()}/auth/impersonate/stop`, { method: 'POST', credentials: 'include' })
  } catch {
    // best-effort — cookies expire on their own within ≤30 min anyway
  }
}

/**
 * Quelqu'un de chez BellumAI est-il connecté sur MON espace, en ce moment ?
 * (#1670.2)
 *
 * Best-effort et silencieuse : un échec réseau, une session expirée ou une API
 * plus ancienne qui ne connaît pas la route rendent « inactive ». Un bandeau
 * d'information ne doit jamais casser l'application ni afficher une erreur —
 * mais il ne doit pas non plus s'allumer parce qu'un appel a échoué, ce qui
 * apprendrait à l'ignorer.
 */
export async function fetchImpersonationVisibility(): Promise<{ active: boolean; since: string | null }> {
  try {
    const res = await fetch(`${apiBase()}/auth/impersonate/visibility`, { credentials: 'include' })
    if (!res.ok) return { active: false, since: null }
    const data = (await res.json()) as { active?: unknown; since?: unknown }
    return {
      active: data.active === true,
      since: typeof data.since === 'string' ? data.since : null,
    }
  } catch {
    return { active: false, since: null }
  }
}

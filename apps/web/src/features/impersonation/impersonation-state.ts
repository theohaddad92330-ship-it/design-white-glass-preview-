/**
 * Reads the JS-readable `imp_state` cookie the API sets when an admin
 * impersonation session is active. It carries ONLY display metadata (the
 * impersonated email, the acting admin, and the token expiry) — never the token
 * itself, which lives in the sibling HttpOnly `imp_session` cookie. Absence of
 * this cookie means "not impersonating".
 */
const STATE_COOKIE = 'imp_state'

export type ImpersonationState = {
  email: string
  by: string
  exp: number
}

function fromBase64Url(value: string): string {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  return atob(b64 + pad)
}

export function readImpersonationState(): ImpersonationState | null {
  if (typeof document === 'undefined') return null
  const entry = document.cookie.split('; ').find(c => c.startsWith(`${STATE_COOKIE}=`))
  if (!entry) return null
  const raw = entry.slice(STATE_COOKIE.length + 1)
  if (!raw) return null
  try {
    const parsed = JSON.parse(fromBase64Url(decodeURIComponent(raw))) as Partial<ImpersonationState>
    if (typeof parsed.email !== 'string') return null
    return {
      email: parsed.email,
      by: typeof parsed.by === 'string' ? parsed.by : '',
      exp: typeof parsed.exp === 'number' ? parsed.exp : 0,
    }
  } catch {
    return null
  }
}

import {
  loginSchema,
  signupSchema,
  resetPasswordSchema,
  oauthCallbackSchema,
  confirmResetPasswordSchema,
  mfaCodeSchema,
  mfaChallengeSchema,
  requestOtpSchema,
  verifyOtpSchema,
  SESSION_REVOKED_CODE,
  type ActiveSession,
  type AuthOutcome,
  type MfaEnrollResponse,
  type MfaStatus,
  type SessionResponse,
  type SessionUser,
} from '@bellum/contracts'
import { ApiError, apiFetch, refreshSessionShared } from '@/lib/api'

/**
 * HTTP client for the `/auth/*` endpoints proxying Supabase Auth server-side.
 * Every call goes through `apiFetch` → no direct `supabase-js` usage.
 *
 * All authentication now travels via the user-scoped HttpOnly cookies
 * (`session:{userId}` / `uploadsSig:{userId}`) — `apiFetch` already sets
 * `credentials: 'include'`, so callers don't pass tokens explicitly.
 */
export const authApi = {
  login(email: string, password: string): Promise<AuthOutcome> {
    const body = loginSchema.parse({ email, password })
    return apiFetch<AuthOutcome, typeof body>({ path: '/auth/login', method: 'POST', body })
  },

  signup(email: string, password: string, firstName: string, lastName?: string): Promise<AuthOutcome> {
    const body = signupSchema.parse({ email, password, first_name: firstName, last_name: lastName })
    return apiFetch<AuthOutcome, typeof body>({ path: '/auth/signup', method: 'POST', body })
  },

  /**
   * Session tenue 24 h (15/09/2026) : passe par LA porte du refresh
   * (`refreshSessionShared`, verrou entre onglets) au lieu d'un `apiFetch`
   * direct — deux onglets restaurés ensemble au démarrage ne présentent plus
   * le même refresh token. Rejette une `ApiError` 401 sur un refus réel, 503
   * sur une panne : l'appelant garde sa lecture par statut.
   */
  async refresh(): Promise<Pick<SessionResponse, 'user' | 'expires_at'>> {
    const outcome = await refreshSessionShared()
    if (outcome.status === 'dead') {
      // R15-7 : une révocation garde son code, pour que la session le DISE.
      if (outcome.revoked) throw new ApiError('Session révoquée sur cet appareil', 401, SESSION_REVOKED_CODE)
      throw new ApiError('Session expirée', 401)
    }
    if (outcome.status === 'unavailable') throw new ApiError('Service momentanément indisponible', 503)
    if (outcome.session) return outcome.session
    // Un autre onglet a renouvelé pendant l'attente : les cookies sont neufs,
    // seul l'utilisateur manque.
    const { user } = await authApi.session()
    return { user, expires_at: outcome.expiresAt }
  },

  /** #4608 — `scope: 'tab'` : ne ferme que l'identité de CET onglet (la sortie de la
   *  démonstration ne déconnecte pas la session réelle ouverte à côté). Absent = toutes. */
  logout(options?: { scope?: 'tab' }): Promise<void> {
    return apiFetch<void>({
      path: '/auth/logout',
      method: 'POST',
      ...(options?.scope === 'tab' ? { headers: { 'X-Bellum-Logout-Scope': 'tab' } } : {}),
    })
  },

  session(): Promise<{ user: SessionUser }> {
    return apiFetch<{ user: SessionUser }>({ path: '/auth/session' })
  },

  /** Active devices for the concurrent-session cap (anti password-sharing). */
  listSessions(): Promise<ActiveSession[]> {
    return apiFetch<ActiveSession[]>({ path: '/auth/sessions' })
  },

  /** Sign out one other device (revoke its session). */
  revokeSession(id: string): Promise<void> {
    return apiFetch<void>({ path: `/auth/sessions/${id}/revoke`, method: 'POST' })
  },

  resetPassword(email: string): Promise<{ ok: true }> {
    const body = resetPasswordSchema.parse({ email })
    return apiFetch<{ ok: true }, typeof body>({ path: '/auth/reset-password', method: 'POST', body })
  },

  confirmResetPassword(
    tokenHash: string,
    password: string,
    expiresAt: number,
    signature: string,
  ): Promise<SessionResponse> {
    const body = confirmResetPasswordSchema.parse({
      token_hash: tokenHash,
      expires_at: expiresAt,
      signature,
      password,
    })
    return apiFetch<SessionResponse, typeof body>({ path: '/auth/confirm-reset-password', method: 'POST', body })
  },

  /** Passwordless sign-in step 1 — asks the API to email a 6-digit code to an
   *  existing account. Always resolves `{ ok: true }` (no email enumeration). */
  requestOtp(email: string): Promise<{ ok: true }> {
    const body = requestOtpSchema.parse({ email })
    return apiFetch<{ ok: true }, typeof body>({ path: '/auth/request-otp', method: 'POST', body })
  },

  /** Passwordless sign-in step 2 — exchanges email + code for a session (cookies
   *  set server-side). Returns the same `AuthOutcome` union a password login does
   *  (`authenticated` | `mfa_required`). */
  verifyOtp(email: string, code: string): Promise<AuthOutcome> {
    const body = verifyOtpSchema.parse({ email, code })
    return apiFetch<AuthOutcome, typeof body>({ path: '/auth/verify-otp', method: 'POST', body })
  },

  oauthGoogleUrl(): Promise<{ url: string }> {
    return apiFetch<{ url: string }>({ path: '/auth/oauth/google' })
  },

  oauthCallback(accessToken: string, refreshToken: string): Promise<SessionResponse> {
    const body = oauthCallbackSchema.parse({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    return apiFetch<SessionResponse, typeof body>({ path: '/auth/oauth/callback', method: 'POST', body })
  },

  verifyEmailOtp(userId: string, code: string): Promise<SessionResponse> {
    const body = { code }
    return apiFetch<SessionResponse, typeof body>({
      path: `/auth/verify-email-otp/${encodeURIComponent(userId)}`,
      method: 'POST',
      body,
    })
  },

  resendEmailOtp(userId: string): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>({
      path: `/auth/resend-email-otp/${encodeURIComponent(userId)}`,
      method: 'POST',
    })
  },

  deleteAccount(): Promise<void> {
    return apiFetch<void>({ path: '/auth/account', method: 'DELETE' })
  },

  /* --- TOTP two-factor (RFC 6238) --- */

  mfaStatus(): Promise<MfaStatus> {
    return apiFetch<MfaStatus>({ path: '/auth/2fa/status' })
  },

  mfaEnroll(): Promise<MfaEnrollResponse> {
    return apiFetch<MfaEnrollResponse>({ path: '/auth/2fa/enroll', method: 'POST' })
  },

  mfaVerify(code: string): Promise<MfaStatus> {
    const body = mfaCodeSchema.parse({ code })
    return apiFetch<MfaStatus, typeof body>({ path: '/auth/2fa/verify', method: 'POST', body })
  },

  mfaDisable(code: string): Promise<MfaStatus> {
    const body = mfaCodeSchema.parse({ code })
    return apiFetch<MfaStatus, typeof body>({ path: '/auth/2fa/disable', method: 'POST', body })
  },

  /** Second step of a 2FA login — completes with the same authenticated
   *  `AuthOutcome` a normal login returns (session cookies set server-side). */
  mfaChallenge(mfaToken: string, code: string): Promise<AuthOutcome> {
    const body = mfaChallengeSchema.parse({ mfaToken, code })
    return apiFetch<AuthOutcome, typeof body>({ path: '/auth/2fa/challenge', method: 'POST', body })
  },
}

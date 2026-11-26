import type {
  ConfirmEmailChange,
  EmailChangeRequested,
  PendingEmailChange,
  RequestEmailChange,
  UpdateProfile,
  UserProfile,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * HTTP client for the `/profiles/me` endpoints. Auth travels via
 * the user-scoped HttpOnly cookies (`session:{userId}`) — `apiFetch`
 * already forwards them with `credentials: 'include'`.
 */
export const profileApi = {
  getMe(): Promise<UserProfile> {
    return apiFetch<UserProfile>({ path: '/profiles/me' })
  },

  updateMe(update: UpdateProfile): Promise<UserProfile> {
    return apiFetch<UserProfile, UpdateProfile>({
      path: '/profiles/me',
      method: 'PUT',
      body: update,
    })
  },

  deleteMe(): Promise<void> {
    return apiFetch<void>({ path: '/profiles/me', method: 'DELETE' })
  },

  pendingEmailChange(): Promise<PendingEmailChange> {
    return apiFetch<PendingEmailChange>({ path: '/profiles/me/email/pending-change' })
  },

  requestEmailChange(body: RequestEmailChange): Promise<EmailChangeRequested> {
    return apiFetch<EmailChangeRequested, RequestEmailChange>({
      path: '/profiles/me/email/request-change',
      method: 'POST',
      body,
    })
  },

  confirmEmailChange(body: ConfirmEmailChange): Promise<UserProfile> {
    return apiFetch<UserProfile, ConfirmEmailChange>({
      path: '/profiles/me/email/confirm-change',
      method: 'POST',
      body,
    })
  },
}

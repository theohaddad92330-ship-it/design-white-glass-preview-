/**
 * localStorage key holding a workspace invitation token across the login
 * round-trip. The `/invitation/:token` page stashes it when the visitor is
 * logged out; `useRedirectAfterAuth` consumes it right after authentication to
 * bounce the user back to the accept page. Kept in its own module so the auth
 * hook needn't import the accept-page component.
 */
export const PENDING_INVITATION_KEY = 'bellum.invitationToken'

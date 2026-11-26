/**
 * Least-privilege policy for an impersonation session.
 *
 * POSTURE = REPRODUCE-BUT-DON'T-HARM. An operator impersonates a user to
 * reproduce and diagnose their bugs, so normal product mutations must work
 * (launch/relaunch an analysis, enrich a contact, edit a contact/note, change a
 * commercial status…). Reads are always allowed; a curated DENYLIST blocks only
 * the classes of action that are financial, identity/credential, governance,
 * outbound-as-the-user, integration-connect, or destructive at the account level.
 *
 * Denylist over allowlist is a deliberate trade-off (product-owner decision): the
 * operator needs broad ability to act. The dangerous set is therefore deny-by-
 * PREFIX — any mutating method under a listed prefix is blocked, including a new
 * sub-route added later — so the security-relevant surface stays closed by
 * default while everything outside it is open for reproduction. A launched
 * analysis consumes the impersonated user's credit; that is accepted and the
 * start is captured by the impersonation audit trail.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Mutating requests explicitly permitted regardless of the denylist. */
const ALWAYS_ALLOWED: ReadonlyArray<{ method: string; path: string }> = [
  // Ending the impersonation session is the ONE lifecycle write that must pass.
  { method: 'POST', path: '/auth/impersonate/stop' },
]

/**
 * Route-prefix classes an impersonation session may NEVER mutate. Deny-by-prefix
 * (path === prefix OR path startsWith prefix + '/'):
 * - /credits           buying credits/seats, checkout — FINANCIAL
 * - /workspaces        members, roles, seats, workspace deletion — GOVERNANCE
 * - /api-keys          API-key creation — CREDENTIAL
 * - /emails            sending email as the user — OUTBOUND-AS-USER
 * - /crm /salesforce /hubspot /google /microsoft /notion /pipedrive /attio /zoho
 *   /integrations /lemlist
 *                      connecting/using an integration as the user (persistent
 *                      access grant + export/send as the user) — INTEGRATION
 *                      (#4427 — Lemlist : clé d'espace + ajout d'un lead à une séquence)
 */
const BLOCKED_PREFIXES: readonly string[] = [
  '/credits',
  '/workspaces',
  '/api-keys',
  '/emails',
  '/crm',
  '/salesforce',
  '/hubspot',
  '/google',
  '/microsoft',
  '/notion',
  '/pipedrive',
  '/attio',
  '/zoho',
  '/integrations',
  '/lemlist',
]

/** Account-dossier root deletion (DELETE /accounts/<id>) — irreversible data
 *  loss for the user. Deeper deletes (a single contact) stay allowed so a bug on
 *  contact removal can still be reproduced. */
const ACCOUNT_ROOT_DELETE = /^\/accounts\/[^/]+$/

function normalizePath(url: string): string {
  const raw = (url ?? '').split('?')[0] ?? ''
  return raw.length > 1 ? raw.replace(/\/$/, '') : raw
}

/**
 * @returns `true` when the request must be REJECTED because the caller is an
 * impersonation session attempting a dangerous state-changing action. Everything
 * NOT matched here (launch analysis, enrich, edit contact, change status…) is
 * allowed so the operator can reproduce the user's bug.
 */
export function isBlockedDuringImpersonation(method: string, url: string): boolean {
  const upperMethod = (method ?? '').toUpperCase()
  if (SAFE_METHODS.has(upperMethod)) return false

  const path = normalizePath(url)

  if (ALWAYS_ALLOWED.some(rule => rule.method === upperMethod && rule.path === path)) return false

  // /auth is mixed (login/refresh/logout are harmless during a session, but
  // password / MFA / email-change / account-deletion / re-consume are dangerous).
  // Block every /auth mutation — the one exception (stop) is allowlisted above.
  if (path === '/auth' || path.startsWith('/auth/')) return true

  if (BLOCKED_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix + '/'))) return true

  if (upperMethod === 'DELETE' && ACCOUNT_ROOT_DELETE.test(path)) return true

  return false
}

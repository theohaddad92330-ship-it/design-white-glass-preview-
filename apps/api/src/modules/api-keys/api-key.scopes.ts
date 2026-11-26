/**
 * Scopes an API key can carry — the public `/v1` surface is READ-ONLY by
 * design, so only `read:*` scopes exist. Adding a scope here is a deliberate
 * product decision (each one widens what a leaked key can reach).
 */
export const PUBLIC_API_SCOPES = ['read:accounts', 'read:contacts'] as const

export type PublicApiScope = (typeof PUBLIC_API_SCOPES)[number]

export function isPublicApiScope(value: string): value is PublicApiScope {
  return (PUBLIC_API_SCOPES as readonly string[]).includes(value)
}

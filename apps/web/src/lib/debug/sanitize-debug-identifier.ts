/**
 * #2445.15 — un champ de debug visible côté client ne montre jamais une donnée
 * sensible brute (ici l'email de l'utilisateur affiché dans le DevStatusBar).
 */
export function sanitizeDebugIdentifier(email: string | null | undefined): string {
  if (!email) return 'anonymous'

  const atIndex = email.indexOf('@')
  if (atIndex === -1) return '***'

  const localPart = email.slice(0, atIndex)
  const domain = email.slice(atIndex + 1)
  const masked = localPart.length <= 1 ? '***' : `${localPart[0]}***`

  return `${masked}@${domain}`
}

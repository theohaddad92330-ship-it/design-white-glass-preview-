import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #2145.7 — UN LIEN PROFOND OUVERT SANS SESSION RETIENT SA CIBLE AVANT `/login`.
 *
 * La logique (retenir/consommer, ignorer le parcours de connexion lui-même)
 * est couverte en comportement dans `features/auth/lib/pre-login-target.test.ts`
 * et son branchement côté retour dans `useRedirectAfterAuth.test.tsx`. Ce
 * fichier ne vérifie que le BRANCHEMENT à l'écriture — même patron que
 * `CustomerPageContent.scroll-restore.test.ts` (#2145.19) : un montage réel
 * demanderait de doubler cinq dépendances pour vérifier une ligne de câblage.
 */
const SOURCE_PATH = join(__dirname, 'CustomerPageContent.tsx')

function readSource(): string {
  return readFileSync(SOURCE_PATH, 'utf8')
}

describe('#2145.7 — la cible avant connexion est retenue avant le renvoi vers /login', () => {
  it('importe rememberPreLoginTarget depuis features/auth/lib/pre-login-target', () => {
    const source = readSource()
    expect(source).toMatch(
      /import\s*\{[^}]*\brememberPreLoginTarget\b[^}]*\}\s*from\s*['"]@\/features\/auth\/lib\/pre-login-target['"]/,
    )
  })

  it('retient la page ACTUELLE juste avant de rendre <RedirectTo to="/login" />', () => {
    const source = readSource()
    const redirectIndex = source.indexOf('<RedirectTo to="/login"')
    expect(redirectIndex).toBeGreaterThan(-1)
    const before = source.slice(Math.max(0, redirectIndex - 400), redirectIndex)
    expect(before).toMatch(/rememberPreLoginTarget\(/)
  })
})

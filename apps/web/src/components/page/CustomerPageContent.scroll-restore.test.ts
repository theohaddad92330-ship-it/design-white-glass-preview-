import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #2145.19 — « RETOUR À L'APP » RESTITUE AUSSI LE DÉFILEMENT QUITTÉ.
 *
 * La logique (mémoire, restitution une seule fois, sur l'origine exacte) est
 * couverte en comportement dans `lib/return-to-app.test.ts`. Ce fichier ne
 * vérifie que le BRANCHEMENT au conteneur qui défile réellement — même
 * patron que `CustomerPageContent.mobile.test.ts` (#2117.84) : un montage
 * réel demanderait de doubler cinq dépendances (`useSession`,
 * `useOnboardingStatus`, `useCurrentRouteAccess`, `SectionTabs`,
 * `PageHeader`) pour vérifier trois lignes de câblage.
 */
const SOURCE_PATH = join(__dirname, 'CustomerPageContent.tsx')

function readSource(): string {
  return readFileSync(SOURCE_PATH, 'utf8')
}

describe('#2145.19 — le conteneur qui défile mémorise et restitue sa position', () => {
  it('importe les deux moitiés du mécanisme depuis lib/return-to-app', () => {
    const source = readSource()
    expect(source).toMatch(
      /import\s*\{[^}]*\bconsumeReturnToAppScrollIfMatching\b[^}]*\btrackContentScrollTop\b[^}]*\}\s*from\s*['"]@\/lib\/return-to-app['"]/,
    )
  })

  it('retient le défilement en CONTINU sur le conteneur qui défile réellement (overflow-y-auto)', () => {
    const source = readSource()
    const refIndex = source.indexOf('ref={scrollContainerRef}')
    expect(refIndex).toBeGreaterThan(-1)
    const around = source.slice(refIndex, refIndex + 300)
    expect(around).toMatch(/onScroll=\{[^}]*trackContentScrollTop/)
    expect(around).toMatch(/overflow-y-auto/)
  })

  it('restitue le défilement retenu au montage, quand la page est l’origine exacte', () => {
    const source = readSource()
    expect(source).toMatch(/consumeReturnToAppScrollIfMatching\(currentHref\)/)
    expect(source).toMatch(/scrollContainerRef\.current\.scrollTop\s*=\s*restored/)
  })
})

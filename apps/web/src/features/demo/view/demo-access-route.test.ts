import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #2705.1 — « Lancer la démo » envoie un visiteur sans lead connu vers
 * `/demo/acces` (`DemoEntryPage.goToAccessForm`). Mesuré à la fusion de la
 * vague 15 (22/09/2026) : `DemoAccessPage` et son hook existaient, testés,
 * mais AUCUNE route ne les montait — chaque nouveau prospect atterrissait sur
 * une page introuvable. Ce test lit l'arbre de routes GÉNÉRÉ, pas une intention.
 */
const SRC = join(__dirname, '..', '..', '..')
const ROUTE_FILE = join(SRC, 'routes', 'demo_', 'acces.tsx')

describe('/demo/acces — le formulaire obligatoire a une route', () => {
  it("l'arbre de routes généré déclare /demo/acces", () => {
    const tree = readFileSync(join(SRC, 'routeTree.gen.ts'), 'utf8')
    expect(tree).toMatch(/fullPath: '\/demo\/acces'/)
  })

  it('la route monte DemoAccessPage et lui passe le ?t= de la page', () => {
    expect(existsSync(ROUTE_FILE)).toBe(true)
    const source = readFileSync(ROUTE_FILE, 'utf8')
    expect(source).toMatch(/createFileRoute\('\/demo_\/acces'\)/)
    expect(source).toMatch(/<DemoAccessPage token=\{t\} reason=\{reason\} \/>/)
  })

  // Constat production du 27/09/2026 — `RedirectTo` renvoie ici un visiteur
  // dont la session de démonstration vient de tomber, avec `?reason=expired`.
  it('la route lit aussi `reason=expired` (session de démo perdue)', () => {
    const source = readFileSync(ROUTE_FILE, 'utf8')
    expect(source).toMatch(/reason\?: 'expired'/)
    expect(source).toMatch(/search\.reason === 'expired'/)
  })
})

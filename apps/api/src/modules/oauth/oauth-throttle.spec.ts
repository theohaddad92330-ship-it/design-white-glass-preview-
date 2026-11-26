import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `POST /oauth/register` (RFC 7591 Dynamic Client Registration) est
 * NON-AUTHENTIFIÉ — n'importe qui peut appeler cette route pour se faire
 * délivrer un client OAuth. `@Throttle` existe pour ne pas en faire un
 * distributeur de clients à volonté.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'ELLE RÉPARE
 * ─────────────────────────────────────────────────────────────────────────────
 * Trouvé le 12/09 : le décorateur écrivait `@Throttle({ default: { limit: 10,
 * ttl: 60_000 } })`. Or `app.module.ts` ne déclare AUCUN throttler nommé
 * `default` — le seul enregistré s'appelle `default-1m`
 * (`throttlers: [{ name: 'default-1m', ... }]`). `@Throttle` de
 * `@nestjs/throttler` accepte n'importe quelle clé et ignore SILENCIEUSEMENT
 * celles qui ne correspondent à aucun throttler déclaré : aucune erreur au
 * démarrage, aucun log, juste une override qui ne s'applique jamais. La route
 * retombait sur le throttler global (120 req/min) — soit douze fois la limite
 * annoncée par le commentaire juste au-dessus du décorateur.
 *
 * Les 7+ autres `@Throttle` du dépôt (ia-proxy, privacy, auth, demo, health,
 * public-api) écrivent tous `'default-1m'` : c'est la convention, et cette
 * route en était le seul exemple qui s'en écartait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE LIT LA SOURCE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un décorateur NestJS ne se voit pas depuis un test unitaire du contrôleur
 * (il est appliqué par le conteneur, pas par la classe), et une clé de
 * throttler inconnue ne produit AUCUNE erreur à l'exécution — un test e2e qui
 * spammerait la route pourrait même sembler passer si le throttler global
 * finit par la couper, masquant que l'override dédié est mort. Lire le texte
 * du décorateur est le seul moyen fiable de vérifier QUELLE clé est écrite.
 */

const CONTROLLER = join(__dirname, 'oauth.controller.ts')

/** Le seul throttler déclaré dans `app.module.ts` (`throttlers: [{ name: 'default-1m', ... }]`). */
const DECLARED_THROTTLER = 'default-1m'

function source(): string {
  return readFileSync(CONTROLLER, 'utf8')
}

/** Le décorateur `@Throttle(...)` qui suit `@Post('oauth/register')`, s'il y en a un. */
function registerThrottleDecorator(text: string): string | null {
  const lines = text.split('\n')
  const postIndex = lines.findIndex(line => line.includes(`@Post('oauth/register')`))
  if (postIndex === -1) return null
  // Le décorateur peut être précédé d'un commentaire (c'est le cas ici) : on
  // cherche @Throttle( sur les quelques lignes qui suivent le @Post, jusqu'à
  // la ligne de méthode (async register...).
  for (let i = postIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes('async register')) return null
    if (line.trim().startsWith('@Throttle(')) return line.trim()
  }
  return null
}

describe('POST /oauth/register porte le throttler DÉCLARÉ', () => {
  it('lit vraiment le contrôleur — sans ça, la garde serait verte sur du vide', () => {
    const text = source()
    expect(text.length).toBeGreaterThan(500)
    expect(text).toContain(`@Post('oauth/register')`)
  })

  it("cite la clé 'default-1m' — 'default' seul ne correspond à aucun throttler déclaré", () => {
    const decorator = registerThrottleDecorator(source())
    expect(decorator).not.toBeNull()
    expect(decorator).toContain(`'${DECLARED_THROTTLER}'`)
    // Négatif nommé : la clé nue qui a causé le défaut ne doit plus apparaître
    // comme clé de throttler (un `default:` sans guillemets, pas suivi de -1m).
    expect(decorator).not.toMatch(/[{,]\s*default\s*:/)
  })

  it('sait dire NON — remettre la clé nue `default` est détecté', () => {
    // On casse volontairement le code que la garde protège : reproduction
    // EXACTE du défaut du 12/09.
    const broken = source().replace(
      `@Throttle({ '${DECLARED_THROTTLER}': { limit: 10, ttl: 60_000 } })`,
      '@Throttle({ default: { limit: 10, ttl: 60_000 } })',
    )
    expect(broken).not.toEqual(source())
    const brokenDecorator = registerThrottleDecorator(broken)
    expect(brokenDecorator).not.toBeNull()
    expect(brokenDecorator).not.toContain(`'${DECLARED_THROTTLER}'`)
  })

  it("n'attrape pas ce qu'elle ne vise pas — les autres routes du contrôleur ne sont pas concernées", () => {
    // Témoin de cas légitimes voisins : `metadata` (RFC 8414) n'a pas de
    // corps sensible côté coût et n'a jamais porté de `@Throttle` — la garde
    // ne doit rien réclamer sur cette route-là.
    const lines = source().split('\n')
    const metadataIndex = lines.findIndex(line => line.includes("@Get('.well-known/oauth-authorization-server')"))
    expect(metadataIndex).toBeGreaterThan(-1)
    expect(lines[metadataIndex - 1]?.trim().startsWith('@Throttle(')).toBe(false)
  })
})

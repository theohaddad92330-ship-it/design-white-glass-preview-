import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #2084.35 — ne jamais exposer les identités historiques de Market Memory à
 * un client, via le chemin d'onboarding.
 *
 * `market-memory-ground-truth` est l'outillage d'ÉVALUATION interne : il porte
 * les identités réelles utilisées pour juger la qualité de la mémoire marché
 * (`MarketMemoryGroundTruthController`, derrière `InternalSecretGuard` —
 * en-tête `x-internal-secret`, aucun JWT utilisateur). Le chemin qu'un
 * onboarding atteint est `EsnProfileController.getMarketMemory` →
 * `MarketMemoryService.esnViewFor`. Ce test fixe la frontière : si un jour un
 * import relie l'un à l'autre, le CI le voit avant qu'une identité d'évaluation
 * ne sorte par une route utilisateur.
 *
 * GA-07 (`module-boundaries.spec.ts`) ne suffit pas ici : c'est un CLIQUET
 * (plafond qui ne redescend que par arbitrage), pas une interdiction — un
 * nouvel import service→service sous le plafond actuel le laisserait passer.
 */

const API_SRC = join(__dirname, '..', '..')

function read(relativePath: string): string {
  return readFileSync(join(API_SRC, relativePath), 'utf8')
}

describe('#2084.35 — la vérité terrain de Market Memory ne fuit pas vers un client', () => {
  it('le service Market Memory consommé par onboarding ne référence PAS le module de vérité terrain', () => {
    const source = read('modules/market-memory/market-memory.service.ts')
    expect(source.length).toBeGreaterThan(0) // #2084 — une garde qui ne lit rien ne garde rien
    expect(source).not.toMatch(/market-memory-ground-truth/i)
    expect(source).not.toMatch(/GroundTruth/)
  })

  it("le contrôleur ESN qui sert l'onboarding ne référence PAS le module de vérité terrain", () => {
    const source = read('modules/esn-profile/esn-profile.controller.ts')
    expect(source.length).toBeGreaterThan(0)
    expect(source).not.toMatch(/market-memory-ground-truth/i)
    expect(source).not.toMatch(/GroundTruth/)
  })

  // Preuve que la garde sait dire NON : si `InternalSecretGuard` disparaissait
  // de ce contrôleur, cette assertion romprait — la vérité terrain deviendrait
  // atteignable par quiconque touche l'API.
  it('le contrôleur de vérité terrain reste fermé derrière InternalSecretGuard', () => {
    const source = read('modules/market-memory-ground-truth/market-memory-ground-truth.controller.ts')
    expect(source).toMatch(/@UseGuards\(InternalSecretGuard\)/)
  })
})

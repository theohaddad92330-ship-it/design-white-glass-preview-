import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-400 — LA MÉMOIRE MARCHÉ N'A QU'UN SEUL POINT D'ENTRÉE POUR AUJOURD'HUI ET
 * DÉCOUVRIR : `MarketMemoryService`, jamais une lecture directe des tables
 * `market_*`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROUVE (#2107.50, épopée #3011)
 * ─────────────────────────────────────────────────────────────────────────────
 * Onze passages d'écrivain (25/09 → 28/09, commentaires #2107/#2987) ont cherché
 * « la même fonction canonique » entre Aujourd'hui (briefing), Découvrir
 * (discover) et le Marché inversé (reverse-market) en grepant des imports
 * croisés directs entre `briefing-actions.ts`, `apps/web/src/features/discover/*`
 * et `reverse-market.service.ts` — et ont conclu, onze fois, à trois domaines
 * disjoints. Cette lecture comparait le mauvais niveau : `discover` a son PROPRE
 * service côté API (`apps/api/src/modules/ia-proxy/discover-market-memory.service.ts`),
 * jamais regardé par ces audits, qui portait déjà la réponse.
 *
 * Vérifié ici, à neuf, par lecture directe des imports (pas un grep de titre) :
 * `BriefingController.today()` (structuralPotentialPaths, #2107.40) et
 * `DiscoverMarketMemoryService.applyFilters()` (filtres stack/ESN de Découvrir,
 * #2165.28/.30) importent LE MÊME `MarketMemoryService` — ni l'un ni l'autre
 * n'injecte une entité `Market*` directement. C'est la fonction canonique que
 * l'épopée demande, déjà vraie pour DEUX domaines sur trois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE TROISIÈME (REVERSE-MARKET) N'EST PAS AJOUTÉ ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * `ReverseMarketService` lit `territory_snapshots` (veille territoriale
 * publique), un corpus SANS lien avec la mémoire marché par compte — et le
 * brancher pour composer l'exemple de l'épopée (« Sophie se libère » + comptes
 * structurellement compatibles) fabriquerait exactement la shortlist que la
 * doctrine interdit déjà ailleurs dans ce même brief : le trigger
 * `consultant_available` (#2106.6/#2107.5, `briefing.service.ts`) ouvre
 * délibérément la fiche SANS construire de shortlist de comptes, pour ne pas
 * laisser Market Memory « créer un événement ». Unifier reverse-market sur ce
 * modèle romprait la même règle. Cette garde verrouille donc ce qui peut
 * légitimement être partagé (l'ACCÈS à la mémoire marché), pas une troisième
 * consommation qui n'a pas de variante conforme.
 *
 * Même famille que `un-reglage-despace-vit-a-un-seul-endroit.spec.ts` : on ne
 * decrit pas une règle, on la lit dans le code source par équilibrage de repère
 * textuel, pour qu'une régression (une entité `Market*` injectée directement
 * dans `briefing`/`discover`, en contournant le service) fasse rougir CETTE
 * garde plutôt que de se découvrir en revue de code.
 */

const API_SRC = join(__dirname, '..')

const BRIEFING_CONTROLLER = join(API_SRC, 'modules', 'briefing', 'briefing.controller.ts')
const BRIEFING_SERVICE = join(API_SRC, 'modules', 'briefing', 'briefing.service.ts')
const DISCOVER_MARKET_MEMORY_SERVICE = join(API_SRC, 'modules', 'ia-proxy', 'discover-market-memory.service.ts')
const REVERSE_MARKET_SERVICE = join(API_SRC, 'modules', 'consultants', 'matching', 'reverse-market.service.ts')

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

/** Les six tables de la mémoire marché — jamais importées ailleurs que dans le service lui-même. */
const MARKET_MEMORY_ENTITIES: readonly string[] = [
  'MarketCompanyAliasEntity',
  'MarketCompanyResolutionOverrideEntity',
  'MarketCompanySignalEntity',
  'MarketCompanyStackEntity',
  'MarketEsnClientEntity',
  'MarketExEsnAtClientEntity',
]

describe("GA-400 (api) — mémoire marché : un seul point d'entrée pour Aujourd'hui et Découvrir (#2107.50)", () => {
  it('Aujourd’hui (briefing) et Découvrir (discover) passent tous les deux par `MarketMemoryService`', () => {
    const controller = read(BRIEFING_CONTROLLER)
    const discover = read(DISCOVER_MARKET_MEMORY_SERVICE)
    // Preuve que la lecture est réelle, pas un fichier vide qui rendrait la garde verte à tort.
    expect(controller.length).toBeGreaterThan(5_000)
    expect(discover.length).toBeGreaterThan(1_000)
    expect(controller).toContain("from '../market-memory/market-memory.service'")
    expect(discover).toContain("from '../market-memory/market-memory.service'")
  })

  it('ni `briefing` ni `discover` ne contournent le service par une lecture directe des tables `market_*`', () => {
    const sources = [read(BRIEFING_CONTROLLER), read(BRIEFING_SERVICE), read(DISCOVER_MARKET_MEMORY_SERVICE)]
    for (const source of sources) {
      for (const entity of MARKET_MEMORY_ENTITIES) {
        expect(source).not.toContain(entity)
      }
    }
  })

  it('reverse-market reste hors de ce point d’entrée — vérifié, pas supposé (raison ci-dessus, doctrine `consultant_available`)', () => {
    const reverseMarket = read(REVERSE_MARKET_SERVICE)
    expect(reverseMarket.length).toBeGreaterThan(5_000)
    expect(reverseMarket).not.toContain('market-memory.service')
    for (const entity of MARKET_MEMORY_ENTITIES) {
      expect(reverseMarket).not.toContain(entity)
    }
  })
})

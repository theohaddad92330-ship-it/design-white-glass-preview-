import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_COMPATIBLE_ENVIRONMENTS_COVERAGE, DEMO_SEEDED_TABLES } from './demo-coverage'

/**
 * #1625 — « et en démonstration, "Environnements structurellement
 * compatibles" montre quoi ? »
 *
 * `CompatibleEnvironmentsSection` n'a ni table ni clé de `raw_analysis` à
 * elle : la garde PAR TABLE ne pose donc jamais cette question. Ce fichier la
 * pose à sa place, sur le même principe que `demo-discover-result-states.spec.ts`.
 */

const REVERSE_MARKET_PAGE = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'web',
  'src',
  'features',
  'consultants',
  'view',
  'reverse-market',
  'ReverseMarketPage.tsx',
)

/**
 * ⚠️ CE FICHIER NE NOMME PAS LES QUATRE TABLES, ET C'EST VOULU.
 *
 * La première version de cette garde exigeait que la raison de
 * `DEMO_COMPATIBLE_ENVIRONMENTS_COVERAGE` contienne les quatre noms de tables
 * en clair. Elle a fait tomber une AUTRE garde du dépôt :
 * `market-memory-single-source-of-truth.spec.ts` (GA-258) interdit qu'un nom de
 * table de la mémoire marché apparaisse dans du CODE hors de `market-memory/` —
 * et elle retire les commentaires avant de chercher, donc une chaîne de
 * caractères la déclenche là où un commentaire ne la déclenche pas.
 *
 * Les deux gardes avaient raison sur leur propre règle. Celle-ci a cédé, parce
 * que ce qu'elle protège n'est pas « les noms sont écrits ici » mais « la raison
 * est SUBSTANTIELLE et NOMME la cause » — la cause étant le partage des tables
 * entre espaces concurrents, pas leur orthographe. Les quatre noms vivent où ils
 * doivent : `table-scopes.ts` et le commentaire d'en-tête de `demo-coverage.ts`.
 */
const CAUSE_QUI_DOIT_ETRE_NOMMEE = ['MarketMemoryService', 'GA-258', 'PARTAGÉES', 'concurrentes']

/**
 * Les quatre noms, ICI et pas dans `demo-coverage.ts` : GA-258 exclut
 * explicitement les `.spec.ts` de son balayage (`sourceFiles`, ligne 99) —
 * un test a le droit de nommer ce qu'il vérifie, un fichier de production non.
 */
const MARKET_MEMORY_SHARED_TABLES = [
  'market_company_signal',
  'market_esn_client',
  'market_company_stack',
  'market_ex_esn_at_client',
]

describe('couverture démo — « Environnements structurellement compatibles » (#1625)', () => {
  it('LIT le composant réel, pas une liste recopiée à la main', () => {
    const source = readFileSync(REVERSE_MARKET_PAGE, 'utf8')
    expect(source.length).toBeGreaterThan(0)
    expect(source).toContain('CompatibleEnvironmentsSection')
    expect(source).toContain('useMarketContextSearch')
  })

  it('classe la capacité « vide à dessein », et la raison NOMME la cause bloquée par GA-258', () => {
    expect(DEMO_COMPATIBLE_ENVIRONMENTS_COVERAGE.state).toBe('vide_a_dessein')
    for (const cause of CAUSE_QUI_DOIT_ETRE_NOMMEE) {
      expect(DEMO_COMPATIBLE_ENVIRONMENTS_COVERAGE.reason).toContain(cause)
    }
    // Une raison substantielle, comme les autres entrées `vide_a_dessein` du
    // fichier — sait dire NON : une raison de deux mots ne passerait pas ce
    // seuil, et c'est la ligne suivante qui le prouve.
    expect(DEMO_COMPATIBLE_ENVIRONMENTS_COVERAGE.reason.length).toBeGreaterThan(200)
  })

  it('sait dire NON — une raison trop courte échouerait à ce même contrôle (témoin)', () => {
    const tropCourte = { state: 'vide_a_dessein' as const, reason: 'Pas seedable.' }
    expect(tropCourte.reason.length).toBeLessThan(200)
  })

  it('les quatre tables bloquées ne sont, À RAISON, jamais dans `DEMO_SEEDED_TABLES`', () => {
    // Témoin de cas légitime voisin : si l'une d'elles y apparaissait un jour,
    // GA-258 (`market-memory-single-source-of-truth.spec.ts`) romprait avant
    // même que ce test ne s'en aperçoive — les deux gardes se recoupent, elles
    // ne se substituent pas l'une à l'autre.
    for (const table of MARKET_MEMORY_SHARED_TABLES) {
      expect(DEMO_SEEDED_TABLES).not.toContain(table)
    }
  })
})

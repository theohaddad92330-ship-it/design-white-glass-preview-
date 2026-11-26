import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_OBSERVED_ONLY_PARTNER_COVERAGE, DEMO_SEEDED_TABLES } from './demo-coverage'

/**
 * #1624 — « et en démonstration, "Route partenaire potentielle" (la relation
 * seulement OBSERVÉE) montre quoi ? »
 *
 * `DEMO_OBSERVED_ONLY_PARTNER_COVERAGE` (`demo-coverage.ts`) a été écrit sans
 * appelant : le motif n°1 de ce dépôt, du code juste que personne n'atteint.
 * Ce fichier est cet appelant, sur le même principe que
 * `demo-compatible-environments-coverage.spec.ts` — `TabPartners` n'a pas de
 * TABLE à lui (`account_partners` est seedée) ni de clé `raw_analysis`, mais un
 * ÉTAT de cette table (« observée par le corpus de la mémoire marché ») que la
 * garde par table ne pose jamais.
 */

const TAB_PARTNERS = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'web',
  'src',
  'features',
  'accounts',
  'view',
  'account-detail',
  'tabs',
  'TabPartners.tsx',
)

/**
 * ⚠️ CE FICHIER NE NOMME PAS LES QUATRE TABLES DE LA MÉMOIRE MARCHÉ EN DEHORS
 * DE `.spec.ts`, MÊME LEÇON QUE LE FICHIER VOISIN.
 *
 * `market-memory-single-source-of-truth.spec.ts` (GA-258) interdit qu'un nom de
 * table de la mémoire marché apparaisse dans du CODE hors de `market-memory/` ;
 * elle exclut explicitement les `.spec.ts` de son balayage. Les quatre noms
 * vivent donc ICI et dans `table-scopes.ts`, jamais dans `demo-coverage.ts`.
 */
const CAUSE_QUI_DOIT_ETRE_NOMMEE = ['GA-258', 'PARTAGÉES', 'concurrentes']

const MARKET_MEMORY_SHARED_TABLES = [
  'market_company_signal',
  'market_esn_client',
  'market_company_stack',
  'market_ex_esn_at_client',
]

describe('couverture démo — « Route partenaire potentielle » (relation seulement observée, #1624)', () => {
  it('LIT le composant réel, pas une liste recopiée à la main', () => {
    const source = readFileSync(TAB_PARTNERS, 'utf8')
    expect(source.length).toBeGreaterThan(0)
    expect(source).toContain('isObservedOnly')
    expect(source).toContain('market_observation')
  })

  it('classe la capacité « vide à dessein », et la raison NOMME la cause bloquée par GA-258', () => {
    expect(DEMO_OBSERVED_ONLY_PARTNER_COVERAGE.state).toBe('vide_a_dessein')
    for (const cause of CAUSE_QUI_DOIT_ETRE_NOMMEE) {
      expect(DEMO_OBSERVED_ONLY_PARTNER_COVERAGE.reason).toContain(cause)
    }
    // Une raison substantielle, comme les entrées voisines — sait dire NON :
    // une raison de deux mots ne passerait pas ce seuil (ligne suivante).
    expect(DEMO_OBSERVED_ONLY_PARTNER_COVERAGE.reason.length).toBeGreaterThan(200)
  })

  it('sait dire NON — une raison trop courte échouerait à ce même contrôle (témoin)', () => {
    const tropCourte = { state: 'vide_a_dessein' as const, reason: 'Pas seedable.' }
    expect(tropCourte.reason.length).toBeLessThan(200)
  })

  it('`account_partners` reste SEEDÉE — ce n’est pas la table qui est vide, c’est un de ses ÉTATS', () => {
    // Témoin de cas légitime voisin : cette garde ne doit PAS confondre
    // « la table entière n'est pas seedée » (ce serait faux, elle l'est,
    // 3 sociétés sur le client fictif) avec « l'état "observée par le corpus"
    // ne se sème pas » (ce qui est vrai, et c'est CE qui est classé ici).
    expect(DEMO_SEEDED_TABLES).toContain('account_partners')
  })

  it('les quatre tables partagées bloquées par GA-258 ne sont, à raison, jamais dans `DEMO_SEEDED_TABLES`', () => {
    for (const table of MARKET_MEMORY_SHARED_TABLES) {
      expect(DEMO_SEEDED_TABLES).not.toContain(table)
    }
  })
})

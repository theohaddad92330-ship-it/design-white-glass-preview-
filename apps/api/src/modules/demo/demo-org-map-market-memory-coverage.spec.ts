import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_ORG_MAP_MARKET_MEMORY_COVERAGE, DEMO_SEEDED_TABLES } from './demo-coverage'

/**
 * #2837 — « et en démonstration, la ligne mémoire marché de l'organigramme
 * montre quoi ? »
 *
 * `DEMO_ORG_MAP_MARKET_MEMORY_COVERAGE` (`demo-coverage.ts`) a été écrit sans
 * appelant : le motif n°1 de ce dépôt, du code juste que personne n'atteint.
 * Ce fichier est cet appelant, sur le même principe que
 * `demo-observed-only-partner-coverage.spec.ts` — aucune des 4 vues n'a de
 * TABLE à elle ni de clé `raw_analysis` neuve (le graphe reste dans
 * `raw_analysis.org.orgGraph`, déjà seedé), mais chacune porte un ÉTAT du même
 * hook que la carte du dossier de compte, que la garde par clé de contrat ne
 * pose jamais.
 *
 * Les 4 vues (complétées le 25/09/2026, même jour) : `OrgInfluenceMap.tsx`
 * (carte système, racine), `GroupOrgView.tsx` (entité `depth === 0`),
 * `HierarchyOrgView.tsx`/`FocalOrgView.tsx` (direction ouverte, seulement
 * quand elle est une racine — GA-391).
 */

const ORG_DIR = join(
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
  'organigramme',
)

const ORG_MARKET_MEMORY_VIEWS = [
  join(ORG_DIR, 'OrgInfluenceMap.tsx'),
  join(ORG_DIR, 'GroupOrgView.tsx'),
  join(ORG_DIR, 'HierarchyOrgView.tsx'),
  join(ORG_DIR, 'FocalOrgView.tsx'),
]

/**
 * ⚠️ CE FICHIER NE NOMME PAS LES QUATRE TABLES DE LA MÉMOIRE MARCHÉ EN DEHORS
 * DE `.spec.ts`, MÊME LEÇON QUE LES FICHIERS VOISINS.
 *
 * `market-memory-single-source-of-truth.spec.ts` (GA-258) interdit qu'un nom
 * de table de la mémoire marché apparaisse dans du CODE hors de
 * `market-memory/` ; elle exclut explicitement les `.spec.ts` de son
 * balayage. Les quatre noms vivent donc ICI et dans `table-scopes.ts`, jamais
 * dans `demo-coverage.ts`.
 */
const CAUSE_QUI_DOIT_ETRE_NOMMEE = ['GA-258', 'PARTAGÉES', 'concurrentes']

const MARKET_MEMORY_SHARED_TABLES = [
  'market_company_signal',
  'market_esn_client',
  'market_company_stack',
  'market_ex_esn_at_client',
]

describe('couverture démo — la ligne mémoire marché des 4 vues de l’organigramme (#2837)', () => {
  it('LIT les 4 composants réels, pas une liste recopiée à la main', () => {
    for (const view of ORG_MARKET_MEMORY_VIEWS) {
      const source = readFileSync(view, 'utf8')
      expect(source.length).toBeGreaterThan(0)
      expect(source).toContain('useAccountMarketContext')
      expect(source).toContain('marketMemory')
    }
  })

  it('classe la capacité « vide à dessein », et la raison NOMME la cause bloquée par GA-258', () => {
    expect(DEMO_ORG_MAP_MARKET_MEMORY_COVERAGE.state).toBe('vide_a_dessein')
    for (const cause of CAUSE_QUI_DOIT_ETRE_NOMMEE) {
      expect(DEMO_ORG_MAP_MARKET_MEMORY_COVERAGE.reason).toContain(cause)
    }
    // Une raison substantielle, comme les entrées voisines — sait dire NON :
    // une raison de deux mots ne passerait pas ce seuil (ligne suivante).
    expect(DEMO_ORG_MAP_MARKET_MEMORY_COVERAGE.reason.length).toBeGreaterThan(200)
  })

  it('sait dire NON — une raison trop courte échouerait à ce même contrôle (témoin)', () => {
    const tropCourte = { state: 'vide_a_dessein' as const, reason: 'Pas seedable.' }
    expect(tropCourte.reason.length).toBeLessThan(200)
  })

  it('les quatre tables partagées bloquées par GA-258 ne sont, à raison, jamais dans `DEMO_SEEDED_TABLES`', () => {
    for (const table of MARKET_MEMORY_SHARED_TABLES) {
      expect(DEMO_SEEDED_TABLES).not.toContain(table)
    }
  })
})

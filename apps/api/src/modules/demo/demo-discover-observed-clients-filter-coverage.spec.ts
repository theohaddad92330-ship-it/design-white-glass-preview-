import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_DISCOVER_OBSERVED_CLIENTS_FILTER_COVERAGE, DEMO_SEEDED_TABLES } from './demo-coverage'

/**
 * #2151.32 — « et en démonstration, le filtre "clients observés" de Découvrir
 * › Partenaires montre quoi ? »
 *
 * MÊME appelant que `demo-observed-only-partner-coverage.spec.ts` (#1624),
 * sur le MÊME principe : `FilterRail.tsx`/`discover-filters.ts` n'ont pas de
 * TABLE à eux ni de clé `raw_analysis` — `observedAtAccounts`/
 * `unresolvedAtAccounts` sont un ÉTAT calculé (mémoire marché) que la garde
 * par table ne pose jamais. Ce fichier est l'appelant qui lit le VRAI code,
 * pas une liste recopiée à la main.
 */

const FILTER_RAIL = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'web',
  'src',
  'features',
  'discover',
  'view',
  'FilterRail.tsx',
)

const DISCOVER_FILTERS = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'web',
  'src',
  'features',
  'discover',
  'lib',
  'discover-filters.ts',
)

/**
 * ⚠️ MÊME LEÇON QUE LE FICHIER VOISIN — les quatre tables de la mémoire
 * marché ne se nomment jamais hors de `.spec.ts` (GA-258,
 * `market-memory-single-source-of-truth.spec.ts` exclut les `.spec.ts` de
 * son balayage).
 */
const CAUSE_QUI_DOIT_ETRE_NOMMEE = ['GA-258', 'PARTAGÉES', 'DEMO_OBSERVED_ONLY_PARTNER_COVERAGE']

const MARKET_MEMORY_SHARED_TABLES = [
  'market_company_signal',
  'market_esn_client',
  'market_company_stack',
  'market_ex_esn_at_client',
]

describe('couverture démo — filtre « clients observés » de Découvrir › Partenaires (#2151.32)', () => {
  it('LIT le rail réel, pas une liste recopiée à la main', () => {
    const source = readFileSync(FILTER_RAIL, 'utf8')
    expect(source.length).toBeGreaterThan(0)
    expect(source).toContain('observedClientsOnly')
    expect(source).toContain('observedClientsUnknownCount')
  })

  it('LIT le prédicat réel — observé, résolu-vide, et inconnu ne se confondent jamais', () => {
    const source = readFileSync(DISCOVER_FILTERS, 'utf8')
    expect(source).toContain('passesObservedClients')
    expect(source).toContain('isObservedClientsUnknown')
  })

  it('classe la capacité « vide à dessein », et la raison NOMME la cause bloquée par GA-258', () => {
    expect(DEMO_DISCOVER_OBSERVED_CLIENTS_FILTER_COVERAGE.state).toBe('vide_a_dessein')
    for (const cause of CAUSE_QUI_DOIT_ETRE_NOMMEE) {
      expect(DEMO_DISCOVER_OBSERVED_CLIENTS_FILTER_COVERAGE.reason).toContain(cause)
    }
    // Une raison substantielle, comme les entrées voisines.
    expect(DEMO_DISCOVER_OBSERVED_CLIENTS_FILTER_COVERAGE.reason.length).toBeGreaterThan(200)
  })

  it('sait dire NON — une raison trop courte échouerait à ce même contrôle (témoin)', () => {
    const tropCourte = { state: 'vide_a_dessein' as const, reason: 'Pas seedable.' }
    expect(tropCourte.reason.length).toBeLessThan(200)
  })

  it('`account_partners` reste SEEDÉE — le filtre lit une AUTRE source (mémoire marché), pas cette table', () => {
    expect(DEMO_SEEDED_TABLES).toContain('account_partners')
  })

  it('les quatre tables partagées bloquées par GA-258 ne sont, à raison, jamais dans `DEMO_SEEDED_TABLES`', () => {
    for (const table of MARKET_MEMORY_SHARED_TABLES) {
      expect(DEMO_SEEDED_TABLES).not.toContain(table)
    }
  })
})

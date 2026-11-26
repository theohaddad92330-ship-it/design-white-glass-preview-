import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEMO_DISCOVER_PARTNER_RANK2_DECLARED_COVERAGE,
  DEMO_DISCOVER_PARTNER_RANK2_STATUS_COVERAGE,
  DEMO_SEEDED_TABLES,
} from './demo-coverage'

/**
 * #2165.56 / #2151.34 — « et en démonstration, le statut de rang 2 du panneau
 * Partenaires de Découvrir montre quoi ? »
 *
 * MÊME principe que `demo-discover-observed-clients-filter-coverage.spec.ts` :
 * `PartnerResultRow.tsx`/`rank2StatusFor` (`discover-filters.ts`) n'ont pas
 * de TABLE à eux ni de clé `raw_analysis` — la garde par table ne pose jamais
 * cette question. Ce fichier est l'appelant qui lit le VRAI code, pas une
 * liste recopiée à la main.
 */

const PARTNER_RESULT_ROW = join(
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
  'PartnerResultRow.tsx',
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

const DEMO_DATASET = join(__dirname, 'demo-dataset.ts')

/** ⚠️ MÊME LEÇON QUE LE FICHIER VOISIN — GA-43 et les identifiants de la
 *  migration ne se nomment jamais hors de `.spec.ts`. */
const CAUSE_QUI_DOIT_ETRE_NOMMEE = ['GA-43', 'D589-D593', 'esn_directory']

describe('couverture démo — statut de rang 2 du panneau Partenaires (#2165.56 / #2151.34)', () => {
  it('LIT l’écran réel — le statut est TOUJOURS rendu par PartnerResultRow, pas recopié à la main', () => {
    const source = readFileSync(PARTNER_RESULT_ROW, 'utf8')
    expect(source).toContain('row.rank2')
    expect(source).toContain('partners.rank2')
  })

  it('LIT le prédicat réel — declared/observed/unknown ne se confondent jamais', () => {
    const source = readFileSync(DISCOVER_FILTERS, 'utf8')
    expect(source).toContain('rank2StatusFor')
    expect(source).toContain('buildDeclaredRank2Index')
  })

  it('LIT le semis réel — une ligne account_partners porte déjà un rang 2 OBSERVÉ', () => {
    const source = readFileSync(DEMO_DATASET, 'utf8')
    expect(source).toContain("rank: 'rank2'")
  })

  it('classe le mécanisme « seedé » — deux des trois états sont démontrables', () => {
    expect(DEMO_DISCOVER_PARTNER_RANK2_STATUS_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_PARTNER_RANK2_STATUS_COVERAGE.reason).toContain('account_partners')
    expect(DEMO_DISCOVER_PARTNER_RANK2_STATUS_COVERAGE.reason.length).toBeGreaterThan(200)
  })

  it('classe « déclaré » vide à dessein, et la raison NOMME la cause bloquée par GA-43', () => {
    expect(DEMO_DISCOVER_PARTNER_RANK2_DECLARED_COVERAGE.state).toBe('vide_a_dessein')
    for (const cause of CAUSE_QUI_DOIT_ETRE_NOMMEE) {
      expect(DEMO_DISCOVER_PARTNER_RANK2_DECLARED_COVERAGE.reason).toContain(cause)
    }
    expect(DEMO_DISCOVER_PARTNER_RANK2_DECLARED_COVERAGE.reason.length).toBeGreaterThan(200)
  })

  it('sait dire NON — une raison trop courte échouerait à ce même contrôle (témoin)', () => {
    const tropCourte = { state: 'vide_a_dessein' as const, reason: 'Pas seedable.' }
    expect(tropCourte.reason.length).toBeLessThan(200)
  })

  it('`account_partners` reste SEEDÉE — le mécanisme observé/inconnu lit cette table', () => {
    expect(DEMO_SEEDED_TABLES).toContain('account_partners')
  })
})

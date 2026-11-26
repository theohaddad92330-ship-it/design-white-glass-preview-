import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SEGMENT_CAPABILITY_EPOCH } from '@bellum/contracts'
import { DEMO_DOSSIER_READ_STALE_COLLECTION_COVERAGE } from './demo-coverage'

/**
 * #2118.51 — « et en démonstration, le bandeau de collecte antérieure de la
 * lecture en sept axes (le CINQUIÈME segment) montre quoi sur la Synthèse ? »
 *
 * `DEMO_DOSSIER_READ_STALE_COLLECTION_COVERAGE` (`demo-coverage.ts`) répond :
 * SEEDÉE, PAR CONSTRUCTION — contrairement à `DEMO_SEGMENT_STALE_COLLECTION
 * _COVERAGE` (entities/signals/strategy, dormant, `vide_a_dessein`), la
 * capacité de CE segment est réellement datée
 * (`SEGMENT_CAPABILITY_EPOCH.dossier_read`), donc `SegmentStaleCollectionNotice`
 * s'affiche réellement, démo comprise, sans qu'un seul octet de fixtures
 * n'ait dû être écrit : `dossier_read_collected_at` est NULL sur les huit
 * dossiers de démonstration (colonne neuve, jamais stampée par un semis).
 */

const SEGMENT_STALE_COLLECTION_NOTICE = join(
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
  'components',
  'SegmentStaleCollectionNotice.tsx',
)

const TAB_OVERVIEW = join(
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
  'TabOverview.tsx',
)

describe('couverture démo — le bandeau de collecte antérieure sur la Synthèse, segment dossier_read (#2118.51)', () => {
  it('LIT le composant réel, pas une liste recopiée à la main — dossier_read y est câblé', () => {
    const source = readFileSync(SEGMENT_STALE_COLLECTION_NOTICE, 'utf8')
    expect(source).toContain('dossier_read')
    expect(source).toContain('isSegmentCollectionStale')
    expect(source).toContain('SEGMENT_CAPABILITY_EPOCH')
  })

  it("LIT l'onglet réel — TabOverview rend bien le bandeau pour dossier_read", () => {
    const source = readFileSync(TAB_OVERVIEW, 'utf8')
    expect(source).toContain('dimension="dossier_read"')
    expect(source).toContain('dossier_read_collected_at')
  })

  it('classe la capacité « seedée par construction », et la raison nomme la cause (colonne neuve, jamais stampée par un semis)', () => {
    expect(DEMO_DOSSIER_READ_STALE_COLLECTION_COVERAGE.state).toBe('seede')
    expect(DEMO_DOSSIER_READ_STALE_COLLECTION_COVERAGE.reason).toContain('SEGMENT_CAPABILITY_EPOCH')
    expect(DEMO_DOSSIER_READ_STALE_COLLECTION_COVERAGE.reason).toContain('2118.51')
    expect(DEMO_DOSSIER_READ_STALE_COLLECTION_COVERAGE.reason.length).toBeGreaterThan(200)
  })

  it('`dossier_read` est daté (contrairement à entities/signals/strategy) — c’est CE qui rend le bandeau réellement visible', () => {
    expect(SEGMENT_CAPABILITY_EPOCH.dossier_read).toBe('2026-09-14T17:46:41.000Z')
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SEGMENT_CAPABILITY_EPOCH } from '@bellum/contracts'
import { DEMO_ENTITIES_STALE_COLLECTION_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #2755 (24/09/2026) — « et en démonstration, le bandeau de collecte
 * antérieure du segment ENTITÉS (le repli snake_case IA qui l'a daté) montre
 * quoi sur l'onglet Organigramme ? »
 *
 * `DEMO_ENTITIES_STALE_COLLECTION_COVERAGE` (`demo-coverage.ts`) répond :
 * SEEDÉE PAR CONSTRUCTION — contrairement à `signals` (témoin FRAIS dédié,
 * Société Générale), `entities` n'a besoin d'aucune fixture : `entities_collected_at`
 * n'existe même pas dans `DemoDossier['account']`, donc NULL pour les six
 * dossiers, et `isSegmentCollectionStale(null, epoch)` rend déjà `true` —
 * même fait honnête qu'un compte client jamais rejoué depuis #2755.
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

const TAB_ORGANIGRAMME = join(
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
  'TabOrganigramme.tsx',
)

describe('couverture démo — le bandeau de collecte antérieure sur l’Organigramme (#2755)', () => {
  it('LIT le composant réel, pas une liste recopiée à la main — entities y est câblé', () => {
    const source = readFileSync(SEGMENT_STALE_COLLECTION_NOTICE, 'utf8')
    expect(source).toContain("entities: 'organigramme.staleCollection'")
    expect(source).toContain('isSegmentCollectionStale')
    expect(source).toContain('SEGMENT_CAPABILITY_EPOCH')
  })

  it("LIT l'onglet réel — TabOrganigramme rend bien le bandeau pour entities", () => {
    const source = readFileSync(TAB_ORGANIGRAMME, 'utf8')
    expect(source).toContain('dimension="entities"')
    expect(source).toContain('entitiesCollectedAt')
  })

  it('classe la capacité « seedée », et la raison nomme la cause (commit 51f284697, #2755)', () => {
    expect(DEMO_ENTITIES_STALE_COLLECTION_COVERAGE.state).toBe('seede')
    expect(DEMO_ENTITIES_STALE_COLLECTION_COVERAGE.reason).toContain('SEGMENT_CAPABILITY_EPOCH')
    expect(DEMO_ENTITIES_STALE_COLLECTION_COVERAGE.reason).toContain('2755')
    expect(DEMO_ENTITIES_STALE_COLLECTION_COVERAGE.reason.length).toBeGreaterThan(200)
  })

  it('`entities` est daté (contrairement à `strategy`) — c’est CE qui rend le bandeau réellement visible', () => {
    expect(SEGMENT_CAPABILITY_EPOCH.entities).toBe('2026-09-23T12:09:58.000Z')
  })

  it('AUCUN dossier de démonstration ne porte `entities_collected_at` — la capacité se démontre par construction', () => {
    for (const dossier of DEMO_DOSSIERS) {
      const entitiesCollectedAt = (dossier.account as unknown as Record<string, unknown>).entities_collected_at
      expect(entitiesCollectedAt).toBeUndefined()
    }
    // Six dossiers réels, aucun exempté : le bandeau s'affiche sur tout le
    // portefeuille de démonstration, exactement comme il s'afficherait sur
    // tout compte client jamais rejoué depuis #2755.
    expect(DEMO_DOSSIERS.length).toBeGreaterThan(0)
  })
})

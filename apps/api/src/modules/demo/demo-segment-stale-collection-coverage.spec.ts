import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { latestCapabilityAt, SEGMENT_CAPABILITY_EPOCH, SEGMENT_CAPABILITY_HISTORY } from '@bellum/contracts'
import { DEMO_SEGMENT_STALE_COLLECTION_COVERAGE } from './demo-coverage'

/**
 * #2543.7 — « et en démonstration, le bandeau de collecte antérieure
 * (#AF.3) montre quoi sur organigramme/veille/plan ? »
 *
 * `DEMO_SEGMENT_STALE_COLLECTION_COVERAGE` (`demo-coverage.ts`) répond :
 * VIDE À DESSEIN, pour une raison STRUCTURELLE — `SegmentStaleCollectionNotice`
 * (apps/web) ne rend jamais rien tant que `SEGMENT_CAPABILITY_EPOCH[dimension]`
 * est absent, et ce lot n'ajoute délibérément aucune entrée pour `strategy`
 * (voir le docblock du contrat). Ce fichier est l'appelant de cette
 * classification, sur le même principe que
 * `demo-observed-only-partner-coverage.spec.ts`.
 *
 * ⚠️ LE FIL À RETORDRE A DÉJÀ MORDU DEUX FOIS : `signals` portait cette même
 * classification jusqu'au 19/09/2026 — #2291.2 (lot R) a daté sa capacité
 * (`SEGMENT_CAPABILITY_EPOCH.signals`), et le troisième `it` ci-dessous a
 * forcé sa reclassification en `seede`, dans une entrée dédiée
 * (`DEMO_SIGNALS_STALE_COLLECTION_COVERAGE`,
 * `demo-signals-stale-collection-coverage.spec.ts`). `entities` l'a rejoint
 * le 24/09/2026 — #2755 (repli snake_case IA, `51f284697`) a daté
 * `SEGMENT_CAPABILITY_EPOCH.entities`, reclassé dans
 * `DEMO_ENTITIES_STALE_COLLECTION_COVERAGE`
 * (`demo-entities-stale-collection-coverage.spec.ts`). Il ne reste plus que
 * `strategy` à ce fil à retordre : dès qu'un futur correctif la date (comme
 * #2543 l'a fait pour contacts, #2291.2 pour signals et #2755 pour
 * entities), le troisième `it` ci-dessous ÉCHOUE de nouveau — c'est voulu.
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

describe('couverture démo — le bandeau de collecte antérieure sur la stratégie (#2543.7)', () => {
  it('LIT le composant réel, pas une liste recopiée à la main', () => {
    const source = readFileSync(SEGMENT_STALE_COLLECTION_NOTICE, 'utf8')
    expect(source.length).toBeGreaterThan(0)
    expect(source).toContain('isSegmentCollectionStale')
    expect(source).toContain('SEGMENT_CAPABILITY_EPOCH')
  })

  it('classe la capacité « vide à dessein », et la raison nomme la cause STRUCTURELLE (aucune capacité datée)', () => {
    expect(DEMO_SEGMENT_STALE_COLLECTION_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_SEGMENT_STALE_COLLECTION_COVERAGE.reason).toContain('SEGMENT_CAPABILITY_EPOCH')
    expect(DEMO_SEGMENT_STALE_COLLECTION_COVERAGE.reason).toContain('2543.7')
    // Une raison substantielle, comme les entrées voisines.
    expect(DEMO_SEGMENT_STALE_COLLECTION_COVERAGE.reason.length).toBeGreaterThan(200)
  })

  it('LE FIL À RETORDRE — échoue le jour où une capacité est datée pour le segment restant, pour forcer la reclassification', () => {
    expect(SEGMENT_CAPABILITY_EPOCH.strategy).toBeUndefined()
  })

  it('`contacts`, `signals` ET `entities` sont datés — ce n’est pas le mécanisme qui est vide, c’est `strategy` qui n’a pas encore sa capacité', () => {
    // ⚠️ AUCUN littéral de date ici, et c'est le correctif du 21/09/2026 : depuis
    // #2655.1, `SEGMENT_CAPABILITY_EPOCH` est DÉRIVÉ de
    // `SEGMENT_CAPABILITY_HISTORY` (la plus récente capacité du segment). Une date
    // recopiée à la main faisait donc échouer ce fichier au premier correctif de
    // collecte LÉGITIME — un faux rouge, pas un fil à retordre : ce test-ci ne
    // garde pas « quelle date », il garde « les trois segments SONT datés ».
    expect(SEGMENT_CAPABILITY_HISTORY.contacts?.length ?? 0).toBeGreaterThan(0)
    expect(SEGMENT_CAPABILITY_HISTORY.signals?.length ?? 0).toBeGreaterThan(0)
    expect(SEGMENT_CAPABILITY_HISTORY.entities?.length ?? 0).toBeGreaterThan(0)
    expect(SEGMENT_CAPABILITY_EPOCH.contacts).toBe(latestCapabilityAt(SEGMENT_CAPABILITY_HISTORY.contacts ?? []))
    expect(SEGMENT_CAPABILITY_EPOCH.signals).toBe(latestCapabilityAt(SEGMENT_CAPABILITY_HISTORY.signals ?? []))
    expect(SEGMENT_CAPABILITY_EPOCH.entities).toBe(latestCapabilityAt(SEGMENT_CAPABILITY_HISTORY.entities ?? []))
    // `latestCapabilityAt([])` rend la chaîne vide : sans ce contrôle, les trois
    // égalités ci-dessus passeraient sur un historique VIDÉ.
    expect(Number.isNaN(Date.parse(SEGMENT_CAPABILITY_EPOCH.contacts ?? ''))).toBe(false)
    expect(Number.isNaN(Date.parse(SEGMENT_CAPABILITY_EPOCH.signals ?? ''))).toBe(false)
    expect(Number.isNaN(Date.parse(SEGMENT_CAPABILITY_EPOCH.entities ?? ''))).toBe(false)
  })
})

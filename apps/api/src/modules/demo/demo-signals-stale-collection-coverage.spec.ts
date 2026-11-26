import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SEGMENT_CAPABILITY_EPOCH } from '@bellum/contracts'
import { DEMO_SIGNALS_STALE_COLLECTION_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #2291.2 (lot R, 19/09/2026) — « et en démonstration, le bandeau de collecte
 * antérieure du segment SIGNAUX (le modèle de contrat observé qui l'a daté)
 * montre quoi sur l'onglet Signaux ? »
 *
 * `DEMO_SIGNALS_STALE_COLLECTION_COVERAGE` (`demo-coverage.ts`) répond :
 * SEEDÉE — contrairement à `DEMO_SEGMENT_STALE_COLLECTION_COVERAGE`
 * (entities/strategy, toujours dormant, `vide_a_dessein`), la capacité de CE
 * segment est réellement datée (`SEGMENT_CAPABILITY_EPOCH.signals`), donc
 * `SegmentStaleCollectionNotice` s'affiche réellement, démo comprise — sur
 * cinq dossiers par construction (jamais stampés), et son CONTRAIRE
 * (l'observation) sur SNCF, seul dossier à porter une date fraîche.
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

const TAB_SIGNAL = join(
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
  'TabSignal.tsx',
)

describe('couverture démo — le bandeau de collecte antérieure sur les Signaux (#2291.2, lot R)', () => {
  it('LIT le composant réel, pas une liste recopiée à la main — signals y est câblé', () => {
    const source = readFileSync(SEGMENT_STALE_COLLECTION_NOTICE, 'utf8')
    expect(source).toContain("signals: 'signalsTab.staleCollection'")
    expect(source).toContain('isSegmentCollectionStale')
    expect(source).toContain('SEGMENT_CAPABILITY_EPOCH')
  })

  it("LIT l'onglet réel — TabSignal rend bien le bandeau pour signals", () => {
    const source = readFileSync(TAB_SIGNAL, 'utf8')
    expect(source).toContain('dimension="signals"')
    expect(source).toContain('signals_collected_at')
  })

  it('classe la capacité « seedée », et la raison nomme la cause (commit 8054769a3, #2291.2)', () => {
    expect(DEMO_SIGNALS_STALE_COLLECTION_COVERAGE.state).toBe('seede')
    expect(DEMO_SIGNALS_STALE_COLLECTION_COVERAGE.reason).toContain('SEGMENT_CAPABILITY_EPOCH')
    expect(DEMO_SIGNALS_STALE_COLLECTION_COVERAGE.reason).toContain('2291.2')
    expect(DEMO_SIGNALS_STALE_COLLECTION_COVERAGE.reason.length).toBeGreaterThan(200)
  })

  it('`signals` est daté (contrairement à entities/strategy) — c’est CE qui rend le bandeau réellement visible', () => {
    // #3504 (01/10/2026, entree en dernier dans le segment signals) — la capacité la PLUS
    // RÉCENTE du segment a bougé depuis #2291.2 ; `latestCapabilityAt` la
    // déduit, ce test la relit plutôt que de la recopier à la main.
    // #4398.2 (K1) — la dernière : le nom légal de l'entité (21/10/2026, 09:12Z). Avant elle, #4327 (19/10, 19:10Z).
    // #4327 — la capacité `signals` précédente : les filiales nommées par le web restent dans le dossier
    // (19/10/2026, 19:10Z) ; avant elle, #4031, le rattachement des offres au groupe (11/10/2026, 18:41Z).
    // #4437.5 — la dernière : le rattachement des offres (23/10/2026, 14:40Z). Avant elle, #4398.2 (21/10, 09:12Z).
    // #4754 — la dernière : la collecte des offres au-delà de douze mois (28/10/2026, 20:03:39Z). Avant elle, #4437.5.
    // #4762 — la dernière : la collecte sans borne d'âge (31/10/2026, 09:55Z). Avant elle, #4754.
    // #2322.70 — la dernière : rôle, équipe, compétences et tension des offres (31/10/2026, 15:50Z). Avant elle, #4762.
    expect(SEGMENT_CAPABILITY_EPOCH.signals).toBe('2026-10-31T15:50:00.000Z')
  })

  it('SNCF SEUL porte une collecte signaux FRAÎCHE — le témoin OPPOSÉ, observé plutôt qu’antérieur', () => {
    const at = SEGMENT_CAPABILITY_EPOCH.signals as string
    const sncf = DEMO_DOSSIERS.find(d => d.account.company_name === 'SNCF')
    expect(sncf?.account.signals_collected_at).toBeDefined()
    expect(new Date(sncf?.account.signals_collected_at as string).getTime() > new Date(at).getTime()).toBe(true)
    expect(sncf?.account.raw_analysis.contract_model).toBeTruthy()

    const fresh = DEMO_DOSSIERS.filter(d => d.account.signals_collected_at)
    const stale = DEMO_DOSSIERS.filter(d => !d.account.signals_collected_at)
    // Un seul témoin frais dans un portefeuille de trois — pas « tout est à jour ».
    expect(fresh.length).toBe(1)
    expect(stale.length).toBe(DEMO_DOSSIERS.length - 1)
  })
})

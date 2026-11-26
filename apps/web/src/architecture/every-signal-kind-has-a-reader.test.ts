/**
 * #3928.2 — LA MATRICE TYPES DE SIGNAL × SURFACES, AVEC SA PREUVE.
 *
 * Chaque nature de signal que l'analyse peut écrire (`signalKindSchema`) doit
 * avoir un lecteur sur CHAQUE surface qui montre des signaux. Cette garde est
 * la matrice elle-même : une ligne par nature, une colonne par surface, et
 * chaque case est CALCULÉE par le vrai code de la surface — jamais déclarée
 * « oui » sur parole. Une nature ajoutée au contrat sans ligne ici fait
 * échouer la CI : « un type sans lecteur » ne passe plus en silence.
 *
 * Les surfaces et leur appelant (détail : `agent_docs/matrice-signaux-surfaces.md`) :
 *  - Veille d'un compte — `TabSignal.tsx` → `buildAccountWatchData` (catégorie de filtre) ;
 *  - Mes cibles / Laura / cloche — `readRecentSignals` (`@bellum/contracts`), via
 *    `listAccountSignals` (Mes cibles, `copilot-bridge` pour Laura) et
 *    `notifyBuySignalForAccount` (cloche) : la nature y voyage telle quelle ;
 *  - Découvrir — `mergeKnownSignals` → `knownSignalType` (famille de signal).
 */
import {
  readRecentSignals,
  signalKindSchema,
  type Account,
  type RecentSignal,
  type SignalKind,
} from '@bellum/contracts'
import { crmSignalsForWatch } from '@/features/accounts/model/crmSignals'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildAccountWatchData } from '@/features/accounts/model/watchData'
import type { WatchCategory } from '@/features/accounts/model/watch'
import { knownSignalType } from '@/features/discover/lib/discover-known-signals'
import { SIGNAL_NATURES, type DiscoverSignal } from '@/features/discover/lib/discover-types'
import { i18n } from '@/i18n'

type SurfaceCells = { veille: WatchCategory; decouvrir: DiscoverSignal['type'] }

/** La matrice. Mes cibles, Laura et la cloche lisent la nature TELLE QUELLE (même lecteur) : prouvé plus bas. */
const SIGNAL_KIND_SURFACES: Record<SignalKind, SurfaceCells> = {
  nomination: { veille: 'nomination', decouvrir: 'business' },
  budget: { veille: 'budget', decouvrir: 'business' },
  projet: { veille: 'historique', decouvrir: 'business' },
  incident: { veille: 'historique', decouvrir: 'business' },
  regulation: { veille: 'historique', decouvrir: 'business' },
  acquisition: { veille: 'historique', decouvrir: 'business' },
  partenariat: { veille: 'historique', decouvrir: 'business' },
  restructuration: { veille: 'historique', decouvrir: 'business' },
  recrutement: { veille: 'recrutement', decouvrir: 'hiring' },
  appel_offres: { veille: 'appel_offres', decouvrir: 'tender' },
  marche_public: { veille: 'marche_public', decouvrir: 'tender' },
  transformation: { veille: 'historique', decouvrir: 'business' },
  demenagement: { veille: 'historique', decouvrir: 'business' },
  investissement: { veille: 'budget', decouvrir: 'business' },
  organisation: { veille: 'historique', decouvrir: 'business' },
  levee_fonds: { veille: 'historique', decouvrir: 'funding' },
  technologie: { veille: 'historique', decouvrir: 'tech' },
  contact: { veille: 'historique', decouvrir: 'business' },
  recours_externe: { veille: 'historique', decouvrir: 'business' },
  // F2 (Louis 29/10/2026) — `ecosystem` ENTRE dans le contrat. Cette garde exige un LECTEUR par nature sur chaque
  // surface, elle n'interdit aucune nature : la ligne ci-contre est le fait nouveau qu'on lui donne, pas un
  // assouplissement. Avant, un signal d'écosystème relu de `signal_history` retombait sur `business` alors que
  // le même signal frais s'affichait `ecosystem` — une nature qui change selon l'âge du signal est un piège à diagnostic.
  ecosystem: { veille: 'historique', decouvrir: 'ecosystem' },
}

const WATCH_CATEGORIES: readonly WatchCategory[] = [
  'recrutement',
  'appel_offres',
  'marche_public',
  'nomination',
  'budget',
  'historique',
]

function rawSignal(kind: SignalKind) {
  return { id: 's1', signal: `Fait daté ${kind}`, type: kind, source: 'Registre public', date: '2026-09-01' }
}

/** Une ligne de matrice manquante ou en trop — la garde doit savoir la nommer. */
function missingRows(kinds: readonly string[], matrix: Record<string, unknown>): string[] {
  return kinds.filter(kind => !(kind in matrix))
}

describe('#3928.2 — chaque nature de signal a un lecteur sur chaque surface', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('fr')
  })

  it('la garde sait dire NON : une nature sans ligne est nommée', () => {
    expect(missingRows(['nomination', 'nouvelle_nature'], SIGNAL_KIND_SURFACES)).toEqual(['nouvelle_nature'])
  })

  it('la matrice couvre EXACTEMENT les natures du contrat', () => {
    expect(missingRows(signalKindSchema.options, SIGNAL_KIND_SURFACES)).toEqual([])
    expect(Object.keys(SIGNAL_KIND_SURFACES).sort()).toEqual([...signalKindSchema.options].sort())
  })

  it.each(signalKindSchema.options)('%s — Mes cibles, Laura, cloche : le lecteur unique garde la nature', kind => {
    const [read] = readRecentSignals([rawSignal(kind)])
    expect(read).toMatchObject({ type: kind, label: `Fait daté ${kind}` })
  })

  it.each(signalKindSchema.options)('%s — Veille : affiché, dans une catégorie de filtre connue', kind => {
    const account = { id: 'a1', raw_analysis: { recent_signals: [rawSignal(kind)] }, recent_signals: [] }
    const { signals } = buildAccountWatchData(account as unknown as Account)
    expect(signals).toHaveLength(1)
    expect(WATCH_CATEGORIES).toContain(signals[0]?.category)
    expect(signals[0]?.category).toBe(SIGNAL_KIND_SURFACES[kind].veille)
  })

  // #3928.1 — les 3 natures CRM n'appartiennent pas à `signalKindSchema` (elles viennent de
  // `GET /crm/accounts/:id/signals`) : leur lecteur réel est `crmSignalsForWatch` →
  // `buildAccountWatchData`, qui les range sous « historique », nature traduite.
  it.each(['affaire_perdue', 'affaire_dormante', 'affaire_renouvellement'] as const)(
    '%s (CRM) — Veille : affiché, « historique », nature nommée (jamais la clé technique)',
    kind => {
      const crm = crmSignalsForWatch([{ ...rawSignal('contact'), type: kind } as unknown as RecentSignal])
      const account = { id: 'a1', raw_analysis: { recent_signals: [] }, recent_signals: [] }
      const { signals } = buildAccountWatchData(account as unknown as Account, crm)
      expect(signals).toHaveLength(1)
      expect(signals[0]?.category).toBe('historique')
      expect(signals[0]?.type).not.toBe(kind)
    },
  )

  // #3928.2 — une levée de fonds est du CONTEXTE (historique), jamais un besoin actif (budget),
  // même quand son libellé parle de « financement » ou d'« investissement ».
  it('levee_fonds — historique même si le libellé évoque un financement', () => {
    const signal = { ...rawSignal('levee_fonds'), signal: 'Levée de fonds : financement de 20 M€ pour investissement' }
    const account = { id: 'a1', raw_analysis: { recent_signals: [signal] }, recent_signals: [] }
    expect(buildAccountWatchData(account as unknown as Account).signals[0]?.category).toBe('historique')
  })

  it.each(signalKindSchema.options)('%s — Découvrir : une famille de signal filtrable', kind => {
    const family = knownSignalType(kind)
    expect(SIGNAL_NATURES).toContain(family)
    expect(family).toBe(SIGNAL_KIND_SURFACES[kind].decouvrir)
  })
})

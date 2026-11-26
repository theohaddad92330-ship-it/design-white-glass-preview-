import type { Account } from '@bellum/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { buildAccountWatchData, buildInsights } from './watchData'

const accountWith = (signals: unknown[]): Account =>
  ({ id: 'a1', raw_analysis: { recent_signals: signals }, recent_signals: [] }) as unknown as Account

const SIGNAL = {
  signal: 'Recrutement 2024 : 20 000 embauches annoncées',
  type: 'recrutement',
  source: 'edf.fr',
  date: '2024-03-01',
}

describe('buildAccountWatchData', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('#3885 — une offre d’emploi collectée (job) est un recrutement, même sans mot-clé', () => {
    const { signals } = buildAccountWatchData(
      accountWith([
        {
          signal: 'B2B Sales Manager (x/f/m) im Außendienst',
          type: 'signal',
          source_kind: 'job',
          url: 'https://jobs.example.com/offre/1',
          date: '2026-10-11',
        },
        { signal: 'Chef de projet SI', type: 'signal', source: 'Offre d’emploi datée', date: '2026-10-11' },
        { signal: 'Plan stratégique 2030', type: 'signal', source: 'sanofi.com', date: '2026-10-11' },
      ]),
    )
    expect(signals.map(signal => signal.category)).toEqual(['recrutement', 'recrutement', 'historique'])
  })

  it('leaves the sales implication empty rather than echoing the title back', () => {
    // Regression: an absent sales_implication was filled with
    // « Qualifier l'impact commercial … : <titre> », which just repeated the
    // headline shown two lines above.
    const { signals } = buildAccountWatchData(accountWith([SIGNAL]))
    expect(signals[0]?.sales_implication).toBeUndefined()
  })

  it('never produces an implication that contains the signal title', () => {
    const { signals } = buildAccountWatchData(accountWith([SIGNAL]))
    expect(signals[0]?.sales_implication ?? '').not.toContain(SIGNAL.signal)
  })

  it('keeps a real implication produced by the analysis', () => {
    const { signals } = buildAccountWatchData(
      accountWith([{ ...SIGNAL, sales_implication: 'Ouvre un besoin de TMA sur le SI RH.' }]),
    )
    expect(signals[0]?.sales_implication).toBe('Ouvre un besoin de TMA sur le SI RH.')
  })

  it('only builds insights from signals that carry a real implication', () => {
    const { insights } = buildAccountWatchData(accountWith([SIGNAL]))
    expect(insights).toHaveLength(0)
  })

  it('builds an insight when the implication exists', () => {
    const { insights } = buildAccountWatchData(accountWith([{ ...SIGNAL, sales_implication: 'Budget IT en hausse.' }]))
    expect(insights).toEqual([{ title: SIGNAL.signal, detail: 'Budget IT en hausse.' }])
  })

  // #3676 (réfuté en recette 07/10 : un même fait affiché 2 fois sur `?tab=veille`, sous
  // « Pistes à qualifier » ET « Ce que cela implique commercialement ») — `buildInsights`
  // est exporté pour que l'appelant (`TabSignal.tsx`) le rappelle sur les signaux déjà
  // débarrassés de ceux qu'une piste présente ailleurs (`signalsNotCoveredByLeads`),
  // au lieu de la liste brute que `buildAccountWatchData` renvoie par défaut.
  it('excludes a signal already covered by a lead when called on the filtered list', () => {
    const { signals } = buildAccountWatchData(accountWith([{ ...SIGNAL, sales_implication: 'Budget IT en hausse.' }]))
    expect(buildInsights(signals)).toEqual([{ title: SIGNAL.signal, detail: 'Budget IT en hausse.' }])
    // Une fois le signal retiré (par exemple parce qu'une piste le présente déjà
    // ailleurs), il ne redevient pas un insight.
    expect(buildInsights(signals.filter(s => s !== signals[0]))).toEqual([])
  })

  it('carries the freshness the analysis stamped on the signal', () => {
    // `freshness` is a deterministic field the IA already computes (current |
    // archive | undated) but that the Veille timeline never surfaced. It is the
    // "fraîcheur" the restitution demands: a 2021 signal is an archive, not a
    // live trigger.
    const { signals } = buildAccountWatchData(accountWith([{ ...SIGNAL, freshness: 'archive' }]))
    expect(signals[0]?.freshness).toBe('archive')
  })

  it('passes a current freshness through unchanged', () => {
    const { signals } = buildAccountWatchData(accountWith([{ ...SIGNAL, freshness: 'current' }]))
    expect(signals[0]?.freshness).toBe('current')
  })

  it('defaults to undated when the analysis did not classify freshness (never assumes current)', () => {
    const { signals } = buildAccountWatchData(accountWith([SIGNAL]))
    expect(signals[0]?.freshness).toBe('undated')
  })
})

/**
 * #2966 (#2119.22) — « où ? » : TOUJOURS répondue, jamais `undefined`.
 */
describe('buildAccountWatchData — perimeter (#2966, #2119.22)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  const accountWithEntities = (signal: unknown, entities: unknown[], companyName?: string): Account =>
    ({
      id: 'a1',
      company_name: companyName,
      raw_analysis: { recent_signals: [signal], entities_exhaustive: entities },
      recent_signals: [],
    }) as unknown as Account

  it('retrouve l’entité que le texte du signal nomme', () => {
    const { signals } = buildAccountWatchData(
      accountWithEntities(
        { ...SIGNAL, signal: 'EDF Renouvelables recrute 20 ingénieurs' },
        [{ name: 'EDF Renouvelables' }, { name: 'EDF DSI Groupe' }],
        'EDF',
      ),
    )
    expect(signals[0]?.perimeter).toBe('EDF Renouvelables')
  })

  it('retombe sur le compte lui-même quand aucune entité connue n’est nommée', () => {
    const { signals } = buildAccountWatchData(accountWithEntities(SIGNAL, [{ name: 'EDF Renouvelables' }], 'EDF'))
    expect(signals[0]?.perimeter).toBe('EDF')
  })

  it('ne devine RIEN quand ni entité ni nom de compte ne sont connus — jamais `undefined`', () => {
    const { signals } = buildAccountWatchData(accountWithEntities(SIGNAL, [], undefined))
    expect(signals[0]?.perimeter).toBe('Ce compte')
  })
})

// #2617.1 — RETENU : `WatchCategory` classait jobs/news/legal/budget/stack/pains,
// qui ne correspondent PAS aux six catégories métier demandées par Simon
// (recrutement · appel d'offres · marché public · nomination · budget ·
// historique). Chaque signal doit désormais tomber dans une des SIX, jamais
// dans un septième panier ni un panier disparu.
describe('categoryFor (#2617.1 — les six catégories métier de Simon)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  const categoryOf = (type: string, signal: string): string => {
    const { signals } = buildAccountWatchData(accountWith([{ ...SIGNAL, type, signal, source: 'x', date: 'x' }]))
    return signals[0]!.category
  }

  it('classe un signal de recrutement', () => {
    expect(categoryOf('recrutement', 'Recherche 12 développeurs Java à Toulouse')).toBe('recrutement')
  })

  it('classe une nomination SÉPARÉMENT du recrutement (#2617.1 — était fondu dans "jobs")', () => {
    expect(categoryOf('nomination', 'Jean Dupont nommé DSI du groupe')).toBe('nomination')
    expect(categoryOf('', 'Marie Martin prend la direction des systèmes d’information')).toBe('nomination')
  })

  it('classe un appel d’offres SÉPARÉMENT du marché public (#2617.1 — étaient fondus dans "budget")', () => {
    expect(categoryOf('appel_offres', 'Publie un appel d’offres pour la refonte de son SI')).toBe('appel_offres')
    expect(categoryOf('', 'Lance une consultation pour un prestataire cloud')).toBe('appel_offres')
  })

  it('classe un marché public SÉPARÉMENT de l’appel d’offres', () => {
    expect(categoryOf('marche_public', 'La collectivité attribue un marché public de 3M€')).toBe('marche_public')
    expect(categoryOf('', 'Le ministère publie un marché public IT')).toBe('marche_public')
  })

  it('classe un signal budgétaire', () => {
    expect(categoryOf('budget', 'Investissement de 5M€ dans la transformation numérique')).toBe('budget')
  })

  it('range ce qui ne correspond à aucune des cinq catégories nommées dans "historique", jamais un septième panier', () => {
    // Ancien défaut : `stack`/`legal`/`pains`/`news`. Aucun de ces paniers
    // n'existe plus — tout ce qui n'est ni recrutement, ni appel d'offres, ni
    // marché public, ni nomination, ni budget rejoint « historique ».
    expect(categoryOf('restructuration', 'Réorganisation interne du pôle IT')).toBe('historique')
    expect(categoryOf('incident', 'Incident de sécurité rendu public')).toBe('historique')
    expect(categoryOf('', 'Migration vers Azure annoncée')).toBe('historique')
  })
})

describe('#2687 — un signal de la Veille porte l’angle que l’analyse lui a rattaché', () => {
  const accountWithHypotheses = (signals: unknown[], qualified_hypotheses: unknown[]): Account =>
    ({
      id: 'a1',
      raw_analysis: { recent_signals: signals, qualified_hypotheses },
      recent_signals: [],
    }) as unknown as Account

  it('remonte l’angle ESN et la première action du signal cité', () => {
    const { signals } = buildAccountWatchData(
      accountWithHypotheses(
        [{ ...SIGNAL, id: 's1' }],
        [
          {
            hypothesis: 'industrialise ses modèles ML',
            based_on_signal_ids: ['s1'],
            esn_angle: 'renfort MLOps',
            first_action: 'cadrer le besoin avec le CDO',
          },
        ],
      ),
    )
    expect(signals[0]?.angles).toEqual([
      {
        hypothesis: 'industrialise ses modèles ML',
        esnAngle: 'renfort MLOps',
        firstAction: 'cadrer le besoin avec le CDO',
      },
    ])
  })

  it('laisse `angles` VIDE sur une analyse antérieure au lien — jamais un angle deviné', () => {
    // Le signal n'a pas d'`id` : aucune hypothèse ne peut le citer, et la
    // ressemblance de texte ne vaut pas rattachement.
    const { signals } = buildAccountWatchData(
      accountWithHypotheses(
        [SIGNAL],
        [{ hypothesis: 'x', based_on_signals: [SIGNAL.signal], esn_angle: 'renfort MLOps' }],
      ),
    )
    expect(signals[0]?.angles).toEqual([])
  })

  it('laisse `angles` vide quand l’analyse ne porte aucune hypothèse', () => {
    const { signals } = buildAccountWatchData(accountWith([{ ...SIGNAL, id: 's1' }]))
    expect(signals[0]?.angles).toEqual([])
  })
})

// #3922.3 — l'URL persistée par le pipeline atteint le signal de la veille, sans être devinée.
describe('buildAccountWatchData — le lien source (#3922.3)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('porte url et genre posés par le pipeline', () => {
    const { signals } = buildAccountWatchData(
      accountWith([{ ...SIGNAL, url: 'https://www.bodacc.fr/a?id=1', source_kind: 'bodacc' }]),
    )
    expect(signals[0]).toMatchObject({ sourceUrl: 'https://www.bodacc.fr/a?id=1', sourceKind: 'bodacc' })
  })

  it('sait dire NON : un signal collecté avant le lien reste SANS lien (null, jamais la source en guise d’URL)', () => {
    const { signals } = buildAccountWatchData(accountWith([{ ...SIGNAL, source: 'https://lemonde.fr/x' }]))
    expect(signals[0]?.sourceUrl).toBeNull()
  })
})

// #3928.a — un signal lu hors de l'analyse (CRM, lot M01) passe par le MÊME lecteur.
describe('buildAccountWatchData — extraSignals, un seul lecteur (#3928.a)', () => {
  it('lit les signaux supplémentaires avec la même règle de doublon que ceux de l’analyse', () => {
    const extra = [
      { signal: SIGNAL.signal, source: SIGNAL.source, type: 'recrutement', date: SIGNAL.date },
      { signal: 'Affaire perdue il y a 14 mois', source: 'Votre CRM', type: 'budget', date: '2025-08-01' },
    ]
    const { signals } = buildAccountWatchData(accountWith([SIGNAL]), extra)
    expect(signals.map(signal => signal.signal)).toEqual([SIGNAL.signal, 'Affaire perdue il y a 14 mois'])
  })
})

// LUDOVIC-D LC.2 — la veille de STILL (still.fr) ne montre plus les homonymes déjà stockés.
describe('LC.2 — veille : homonymes masqués à la lecture', () => {
  const still = (website: string | null) =>
    ({
      id: 'still',
      website,
      raw_analysis: {
        recent_signals: [
          { signal: 'Still Waters Farm opens a barn', url: 'https://stillwatersfarm.com/n', date: '2026-09-01' },
          { signal: 'Stillwater OK vote un budget', date: '2026-09-02' },
          { signal: 'STILL recrute des techniciens méthodes à Lyon', date: '2026-10-01' },
        ],
      },
      recent_signals: [],
    }) as unknown as Account

  it('ne montre que les signaux du compte', () => {
    expect(buildAccountWatchData(still('https://www.still.fr')).signals.map(s => s.signal)).toEqual([
      'STILL recrute des techniciens méthodes à Lyon',
    ])
  })
  it('SAIT DIRE NON : sans site connu, rien n’est masqué', () => {
    expect(buildAccountWatchData(still(null)).signals).toHaveLength(3)
  })
})

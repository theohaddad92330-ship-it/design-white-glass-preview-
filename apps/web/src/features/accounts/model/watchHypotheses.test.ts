import type { Account } from '@bellum/contracts'
import { beforeAll, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { buildAccountWatchData } from './watchData'

/**
 * #3939.a — recette prod 09/10 : « hypothèses qualifiées + signaux fondateurs »
 * introuvables dans l'onglet Veille. Elles n'y vivaient que comme sous-ligne
 * d'une carte signal ; les signaux qui les fondent sont précisément ceux devenus
 * « pistes », que la liste retire (#3676.6) — les hypothèses disparaissaient avec
 * eux. Elles sont désormais lues pour elles-mêmes, sur TOUS les événements.
 */
const account = (rawAnalysis: Record<string, unknown>): Account =>
  ({ id: 'a1', company_name: 'SG', raw_analysis: rawAnalysis, recent_signals: [] }) as unknown as Account

const SIGNALS = [
  { id: 's1', signal: 'Objectifs relevés au T2 2026', source: 'Presse', date: '2026-08-01', type: 'budget' },
  { id: 's2', signal: 'Plan 2029 annoncé', source: 'Communiqué', date: '2026-07-01', type: 'projet' },
  { id: 's3', signal: 'Augmentation de capital', source: 'BODACC', date: '2026-06-01', type: 'budget' },
]

describe('#3939.a — les hypothèses qualifiées et leurs signaux fondateurs', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('fr')
  })

  it('rattache chaque hypothèse à ses signaux fondateurs PAR IDENTIFIANT', () => {
    const { hypotheses } = buildAccountWatchData(
      account({
        recent_signals: SIGNALS,
        qualified_hypotheses: [
          {
            hypothesis: 'SG arbitre ses investissements applicatifs',
            based_on_signal_ids: ['s1', 's2'],
            confidence: 'probable',
            esn_angle: 'Cadrage de capacité',
            first_action: 'Demander les chantiers cadrés',
          },
        ],
      }),
    )
    expect(hypotheses).toHaveLength(1)
    expect(hypotheses[0]).toMatchObject({
      hypothesis: 'SG arbitre ses investissements applicatifs',
      confidence: 'probable',
      esnAngle: 'Cadrage de capacité',
      firstAction: 'Demander les chantiers cadrés',
      citedSignals: [],
    })
    expect(hypotheses[0]?.foundingSignals.map(signal => signal.signal)).toEqual([
      'Objectifs relevés au T2 2026',
      'Plan 2029 annoncé',
    ])
  })

  it('analyse antérieure au lien : la prose de l’analyse est citée telle quelle, jamais rapprochée d’un signal', () => {
    const { hypotheses } = buildAccountWatchData(
      account({
        recent_signals: SIGNALS,
        qualified_hypotheses: [{ hypothesis: 'H', based_on_signals: ['Augmentation de capital'] }],
      }),
    )
    expect(hypotheses[0]?.foundingSignals).toEqual([])
    expect(hypotheses[0]?.citedSignals).toEqual(['Augmentation de capital'])
  })

  it('une confiance que les signaux cités ne fondent pas n’est pas affichée (jamais corrigée)', () => {
    const { hypotheses } = buildAccountWatchData(
      account({
        recent_signals: SIGNALS,
        qualified_hypotheses: [{ hypothesis: 'H', based_on_signal_ids: ['s1'], confidence: 'confirmee' }],
      }),
    )
    expect(hypotheses[0]?.confidence).toBeNull()
  })

  it('sait dire NON : sans hypothèse, ou une hypothèse sans intitulé, rien', () => {
    expect(buildAccountWatchData(account({ recent_signals: SIGNALS })).hypotheses).toEqual([])
    expect(
      buildAccountWatchData(account({ recent_signals: SIGNALS, qualified_hypotheses: [{ hypothesis: ' ' }] }))
        .hypotheses,
    ).toEqual([])
  })
})

import type { QualifiedHypothesis } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { anglesForSignal } from './signalAngles'

/**
 * #2687 — le rattachement signal → angle SUIT le lien que l'analyse a écrit, et
 * ne le devine jamais. La moitié de ces tests vérifient qu'on ne trouve RIEN
 * quand il n'y a rien : c'est là que se joue la différence entre une réponse et
 * un rapprochement inventé.
 */

const MLOPS: QualifiedHypothesis = {
  hypothesis: 'industrialise ses modèles ML',
  based_on_signals: ['recrut. data', 'plateforme'],
  based_on_signal_ids: ['s1', 's4'],
  confidence: 'probable',
  esn_angle: 'renfort MLOps',
  first_action: 'cadrer le besoin avec le CDO',
}

describe('anglesForSignal — ce que l’analyse a rattaché', () => {
  it('rend l’angle et la première action du signal cité', () => {
    expect(anglesForSignal([MLOPS], 's1')).toEqual([
      {
        hypothesis: 'industrialise ses modèles ML',
        esnAngle: 'renfort MLOps',
        firstAction: 'cadrer le besoin avec le CDO',
      },
    ])
  })

  it('nomme l’hypothèse d’où vient l’angle — un angle seul ne se conteste pas', () => {
    expect(anglesForSignal([MLOPS], 's4')[0]?.hypothesis).toBe('industrialise ses modèles ML')
  })

  it('rend TOUS les angles quand plusieurs hypothèses reposent sur le même signal', () => {
    // Deux angles sur un signal sont deux vérités de l'analyse. En choisir un
    // (le premier, le plus long…) serait l'arbitraire qu'on refuse.
    const second: QualifiedHypothesis = {
      hypothesis: 'refond sa plateforme de données',
      based_on_signal_ids: ['s1'],
      esn_angle: 'renfort data engineering',
    }
    const angles = anglesForSignal([MLOPS, second], 's1')
    expect(angles).toHaveLength(2)
    expect(angles.map(a => a.esnAngle)).toEqual(['renfort MLOps', 'renfort data engineering'])
  })

  it('garde l’ordre de l’analyse — on ne re-classe pas ce qu’on n’a pas jugé', () => {
    const first: QualifiedHypothesis = { hypothesis: 'A', based_on_signal_ids: ['s2'], esn_angle: 'angle A' }
    const second: QualifiedHypothesis = { hypothesis: 'B', based_on_signal_ids: ['s2'], esn_angle: 'angle B' }
    expect(anglesForSignal([second, first], 's2').map(a => a.hypothesis)).toEqual(['B', 'A'])
  })

  it('rend l’action seule quand l’analyse n’a pas produit d’angle', () => {
    const actionOnly: QualifiedHypothesis = {
      hypothesis: 'gèle ses budgets',
      based_on_signal_ids: ['s7'],
      first_action: 'vérifier le calendrier budgétaire',
    }
    expect(anglesForSignal([actionOnly], 's7')).toEqual([
      { hypothesis: 'gèle ses budgets', firstAction: 'vérifier le calendrier budgétaire' },
    ])
  })
})

describe('anglesForSignal — ce qu’on refuse de deviner', () => {
  it('ne rattache RIEN à un signal sans `id` (analyse antérieure au lien)', () => {
    expect(anglesForSignal([MLOPS], undefined)).toEqual([])
    expect(anglesForSignal([MLOPS], '')).toEqual([])
    expect(anglesForSignal([MLOPS], '   ')).toEqual([])
  })

  it('ne rattache RIEN quand aucune hypothèse ne cite ce signal', () => {
    expect(anglesForSignal([MLOPS], 's9')).toEqual([])
    expect(anglesForSignal([], 's1')).toEqual([])
    expect(anglesForSignal(undefined, 's1')).toEqual([])
  })

  it('⚠️ n’apparie JAMAIS par le texte de `based_on_signals`', () => {
    // L'hypothèse dit en prose qu'elle repose sur « recrut. data » ; le signal
    // s'appelle « recrut. data ». La tentation est exactement là — et c'est un
    // rapprochement par proximité, pas un lien. Sans `based_on_signal_ids`, la
    // réponse honnête est : on ne sait pas.
    const proseOnly: QualifiedHypothesis = {
      hypothesis: 'industrialise ses modèles ML',
      based_on_signals: ['recrut. data'],
      esn_angle: 'renfort MLOps',
    }
    expect(anglesForSignal([proseOnly], 'recrut. data')).toEqual([])
    expect(anglesForSignal([proseOnly], 's1')).toEqual([])
  })

  it('⚠️ n’apparie JAMAIS par position — la 1re hypothèse n’est pas le 1er signal', () => {
    const first: QualifiedHypothesis = { hypothesis: 'A', esn_angle: 'angle A' }
    const second: QualifiedHypothesis = { hypothesis: 'B', esn_angle: 'angle B' }
    expect(anglesForSignal([first, second], 's1')).toEqual([])
    expect(anglesForSignal([first, second], '0')).toEqual([])
  })

  it('ignore une hypothèse qui cite le signal sans rien en tirer', () => {
    const mute: QualifiedHypothesis = {
      hypothesis: 'quelque chose bouge',
      based_on_signal_ids: ['s1'],
      esn_angle: '   ',
      first_action: null,
    }
    expect(anglesForSignal([mute], 's1')).toEqual([])
  })
})

// #2952 (#2305.35) — « un projet plausible doit citer les signaux qui le
// fondent » : `confidence` est l'échelle de convergence (1→a_verifier,
// 2→probable, 3+→confirmee) et doit être FONDÉE par autant de citations.
describe('anglesForSignal — la confiance affichée doit être fondée (#2305.35)', () => {
  it('refuse une hypothèse "confirmee" qui ne cite qu’un seul signal fondateur', () => {
    const overclaiming: QualifiedHypothesis = {
      hypothesis: 'industrialise ses modèles ML',
      based_on_signal_ids: ['s1'],
      confidence: 'confirmee',
      esn_angle: 'renfort MLOps',
    }
    expect(anglesForSignal([overclaiming], 's1')).toEqual([])
  })

  it('refuse une hypothèse "probable" qui ne cite qu’un seul signal fondateur', () => {
    const overclaiming: QualifiedHypothesis = {
      hypothesis: 'refond sa plateforme',
      based_on_signal_ids: ['s1'],
      confidence: 'probable',
      esn_angle: 'renfort data',
    }
    expect(anglesForSignal([overclaiming], 's1')).toEqual([])
  })

  it('accepte une hypothèse "confirmee" qui cite trois signaux fondateurs', () => {
    const founded: QualifiedHypothesis = {
      hypothesis: 'industrialise ses modèles ML',
      based_on_signal_ids: ['s1', 's2', 's3'],
      confidence: 'confirmee',
      esn_angle: 'renfort MLOps',
    }
    expect(anglesForSignal([founded], 's1')).toHaveLength(1)
  })

  it('accepte une hypothèse "a_verifier" qui cite un seul signal — c’est son niveau attendu', () => {
    const founded: QualifiedHypothesis = {
      hypothesis: 'signal isolé',
      based_on_signal_ids: ['s1'],
      confidence: 'a_verifier',
      esn_angle: 'à confirmer',
    }
    expect(anglesForSignal([founded], 's1')).toHaveLength(1)
  })

  it('n’a rien à contester sur une confiance absente ou inconnue — n’invente pas de seuil', () => {
    const noConfidence: QualifiedHypothesis = {
      hypothesis: 'x',
      based_on_signal_ids: ['s1'],
      esn_angle: 'y',
    }
    expect(anglesForSignal([noConfidence], 's1')).toHaveLength(1)
  })
})

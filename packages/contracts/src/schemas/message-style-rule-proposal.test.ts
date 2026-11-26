import { describe, expect, it } from 'vitest'
import {
  EXCLUDED_STYLE_LEARNING_SIGNALS,
  MESSAGE_STYLE_RULE_PROPOSAL_STATUSES,
  createMessageStyleRuleProposalSchema,
  isLearnableStyleSignal,
  messageStyleRuleProposalSchema,
  styleLearningSignalSchema,
} from './message-style-rule-proposal.js'

// #2369.13 — ne jamais apprendre une faute, une donnée fausse, un ton agressif isolé.
describe('isLearnableStyleSignal — les trois interdits d’apprentissage de #2369.13', () => {
  it('les trois signaux exclus, nommés', () => {
    expect(EXCLUDED_STYLE_LEARNING_SIGNALS).toEqual([
      'spelling_or_grammar_fix',
      'false_or_fabricated_data_correction',
      'isolated_aggressive_tone',
    ])
  })

  it('aucun des trois interdits n’est apprenable', () => {
    for (const signal of EXCLUDED_STYLE_LEARNING_SIGNALS) {
      expect(isLearnableStyleSignal(signal), signal).toBe(false)
    }
  })

  it('une préférence de formulation, de structure ou de ton reste apprenable', () => {
    expect(isLearnableStyleSignal('wording_preference')).toBe(true)
    expect(isLearnableStyleSignal('structure_preference')).toBe(true)
    expect(isLearnableStyleSignal('tone_preference')).toBe(true)
  })

  it('le schéma accepte les six signaux, exclus compris — la garde vit dans isLearnableStyleSignal, pas dans le parsing', () => {
    for (const signal of styleLearningSignalSchema.options) {
      expect(styleLearningSignalSchema.safeParse(signal).success).toBe(true)
    }
  })
})

// #2369.7/.8 — une réécriture propose, elle ne durcit jamais seule ; l'adoption est un geste explicite.
describe('messageStyleRuleProposalSchema — proposer n’est jamais adopter (#2369.7/.8)', () => {
  it('porte exactement trois statuts — pending, adopted, rejected', () => {
    expect(MESSAGE_STYLE_RULE_PROPOSAL_STATUSES).toEqual(['pending', 'adopted', 'rejected'])
  })

  it('une proposition valide, en attente, sans décideur ni date de décision', () => {
    const proposal = {
      id: '11111111-1111-1111-1111-111111111111',
      workspaceId: '22222222-2222-2222-2222-222222222222',
      templateId: null,
      proposedBy: '33333333-3333-3333-3333-333333333333',
      signal: 'wording_preference',
      observation: 'Le commercial retire systématiquement les points d’exclamation.',
      status: 'pending',
      decidedBy: null,
      decidedAt: null,
      createdAt: '2026-09-25T10:00:00.000Z',
    }
    expect(messageStyleRuleProposalSchema.parse(proposal)).toEqual(proposal)
  })

  it('la création ne porte ni statut, ni décideur — elle naît toujours `pending`, côté serveur', () => {
    const result = createMessageStyleRuleProposalSchema.safeParse({
      signal: 'tone_preference',
      observation: 'Ton plus direct, moins de formules de politesse.',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect('status' in result.data).toBe(false)
      expect('decidedBy' in result.data).toBe(false)
    }
  })

  it('refuse la création portée par un signal exclu (faute, donnée fausse, ton agressif isolé) — le schéma seul ne suffit pas, le service doit encore appeler isLearnableStyleSignal', () => {
    // Le schéma accepte la FORME (voir test ci-dessus) : la garde métier est
    // dans isLearnableStyleSignal, appelée par le service AVANT persistance.
    for (const signal of EXCLUDED_STYLE_LEARNING_SIGNALS) {
      const result = createMessageStyleRuleProposalSchema.safeParse({ signal, observation: 'x' })
      expect(result.success).toBe(true)
      expect(isLearnableStyleSignal(signal)).toBe(false)
    }
  })
})

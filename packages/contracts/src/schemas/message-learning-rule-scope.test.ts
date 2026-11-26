import { describe, expect, it } from 'vitest'
import {
  MESSAGE_LEARNING_RULE_LEVELS,
  describeMessageLearningRuleScope,
  messageLearningRuleScopeSchema,
} from './message-learning-rule-scope.js'

// #2385.5 (épopée #2877) — les 5 niveaux d'apprentissage, gouvernés, JAMAIS
// confondus : chaque niveau porte EXACTEMENT le bon identifiant de portée,
// aucun autre. Le schéma refuse à la construction, pas seulement à la lecture.
describe('messageLearningRuleScopeSchema — les 5 niveaux, jamais confondus (#2385.5)', () => {
  it('nomme les 5 niveaux, dans cet ordre', () => {
    expect(MESSAGE_LEARNING_RULE_LEVELS).toEqual(['message', 'campaign', 'user', 'workspace', 'global'])
  })

  it.each([
    { level: 'message', messageId: 'm1' },
    { level: 'campaign', campaignId: 'c1' },
    { level: 'user', userId: 'u1' },
    { level: 'workspace', workspaceId: 'w1' },
    { level: 'global' },
  ] as const)('accepte le niveau $level avec sa seule portée propre', scope => {
    expect(messageLearningRuleScopeSchema.safeParse(scope).success).toBe(true)
  })

  it('refuse un niveau workspace qui porte en plus un messageId — deux portées confondues', () => {
    const result = messageLearningRuleScopeSchema.safeParse({ level: 'workspace', workspaceId: 'w1', messageId: 'm1' })
    expect(result.success).toBe(false)
  })

  it('refuse un niveau message sans messageId', () => {
    expect(messageLearningRuleScopeSchema.safeParse({ level: 'message' }).success).toBe(false)
  })

  it('refuse un niveau global qui porte un identifiant — global n’a par construction aucune portée', () => {
    const result = messageLearningRuleScopeSchema.safeParse({ level: 'global', workspaceId: 'w1' })
    expect(result.success).toBe(false)
  })

  it('refuse un niveau inconnu', () => {
    expect(messageLearningRuleScopeSchema.safeParse({ level: 'account', accountId: 'a1' }).success).toBe(false)
  })
})

describe('describeMessageLearningRuleScope — libellé humain, jamais deviné', () => {
  it('nomme le niveau et son identifiant pour les 4 niveaux scopés', () => {
    expect(describeMessageLearningRuleScope({ level: 'message', messageId: 'm1' })).toBe('message m1')
    expect(describeMessageLearningRuleScope({ level: 'campaign', campaignId: 'c1' })).toBe('campagne c1')
    expect(describeMessageLearningRuleScope({ level: 'user', userId: 'u1' })).toBe('utilisateur u1')
    expect(describeMessageLearningRuleScope({ level: 'workspace', workspaceId: 'w1' })).toBe('espace w1')
  })

  it('nomme le niveau global sans identifiant, puisqu’il n’en porte aucun', () => {
    expect(describeMessageLearningRuleScope({ level: 'global' })).toBe('global')
  })
})

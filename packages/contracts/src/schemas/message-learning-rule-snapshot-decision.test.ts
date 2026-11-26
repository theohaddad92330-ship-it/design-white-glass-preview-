import { describe, expect, it } from 'vitest'
import {
  MESSAGE_LEARNING_RULE_SNAPSHOT_DECISIONS,
  MESSAGE_LEARNING_RULE_SNAPSHOT_STATUSES,
  decideMessageLearningRuleSnapshotRequestSchema,
  messageLearningRuleSnapshotDecisionSchema,
  messageLearningRuleSnapshotStatusSchema,
} from './message-learning-rule-snapshot-decision.js'

// #2385.1/#2385.5 (épopée #2877) — un snapshot naît `proposed`, seul un geste
// humain explicite le fait avancer.
describe('messageLearningRuleSnapshotStatusSchema', () => {
  it('les trois statuts, proposed en tête — ordre littéral figé (GA-08)', () => {
    expect(MESSAGE_LEARNING_RULE_SNAPSHOT_STATUSES).toEqual(['proposed', 'adopted', 'rejected'])
  })

  it('accepte les trois statuts', () => {
    for (const status of MESSAGE_LEARNING_RULE_SNAPSHOT_STATUSES) {
      expect(messageLearningRuleSnapshotStatusSchema.safeParse(status).success).toBe(true)
    }
  })

  it('refuse un statut hors catalogue', () => {
    expect(messageLearningRuleSnapshotStatusSchema.safeParse('applied').success).toBe(false)
  })
})

describe('messageLearningRuleSnapshotDecisionSchema — #2385.1, la seule sortie de proposed', () => {
  it('les deux décisions, jamais un statut de création', () => {
    expect(MESSAGE_LEARNING_RULE_SNAPSHOT_DECISIONS).toEqual(['adopted', 'rejected'])
  })

  it('refuse "proposed" comme décision — une création n’est pas une décision', () => {
    expect(messageLearningRuleSnapshotDecisionSchema.safeParse('proposed').success).toBe(false)
  })
})

describe('decideMessageLearningRuleSnapshotRequestSchema', () => {
  it('accepte { decision: "adopted" } et { decision: "rejected" }', () => {
    expect(decideMessageLearningRuleSnapshotRequestSchema.safeParse({ decision: 'adopted' }).success).toBe(true)
    expect(decideMessageLearningRuleSnapshotRequestSchema.safeParse({ decision: 'rejected' }).success).toBe(true)
  })

  it('refuse un corps sans décision', () => {
    expect(decideMessageLearningRuleSnapshotRequestSchema.safeParse({}).success).toBe(false)
  })
})

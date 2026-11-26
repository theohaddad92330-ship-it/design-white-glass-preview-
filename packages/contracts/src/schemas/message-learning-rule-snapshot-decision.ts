import { z } from 'zod'

/**
 * MOTEUR D'APPRENTISSAGE DES MESSAGES — LA DÉCISION SUR UN SNAPSHOT (épopée
 * #2877, #2385.1/#2385.5).
 *
 * `message_learning_rule_proposal_snapshots` restait figé à `status =
 * 'proposed'` : la persistance versionnée existait (#2385.5), mais aucun
 * geste humain ne pouvait jamais la faire avancer — le NO-GO #2385.1
 * (« ne pas sur-apprendre d'un cas isolé sans corrélation confondue
 * causalité ») restait un vœu, jamais un mécanisme vérifiable. Ce fichier
 * gouverne le SEUL geste qui manquait, même discipline que
 * `MessageStyleRuleProposal` (#2369.7/.8) : `proposed` est le SEUL statut
 * qu'un enregistrement peut produire, `adopted`/`rejected` n'arrivent que par
 * une décision explicite et séparée — jamais par la création du snapshot
 * elle-même.
 */
export const MESSAGE_LEARNING_RULE_SNAPSHOT_STATUSES = ['proposed', 'adopted', 'rejected'] as const
export const messageLearningRuleSnapshotStatusSchema = z.enum(MESSAGE_LEARNING_RULE_SNAPSHOT_STATUSES)
export type MessageLearningRuleSnapshotStatus = z.infer<typeof messageLearningRuleSnapshotStatusSchema>

/** #2385.1 — LA SEULE façon de sortir de `proposed` : un geste humain explicite, nommé. */
export const MESSAGE_LEARNING_RULE_SNAPSHOT_DECISIONS = ['adopted', 'rejected'] as const
export const messageLearningRuleSnapshotDecisionSchema = z.enum(MESSAGE_LEARNING_RULE_SNAPSHOT_DECISIONS)
export type MessageLearningRuleSnapshotDecision = z.infer<typeof messageLearningRuleSnapshotDecisionSchema>

/** Corps de `POST .../proposed-rule/snapshot/:version/decide`. */
export const decideMessageLearningRuleSnapshotRequestSchema = z.object({
  decision: messageLearningRuleSnapshotDecisionSchema,
})
export type DecideMessageLearningRuleSnapshotRequest = z.infer<typeof decideMessageLearningRuleSnapshotRequestSchema>

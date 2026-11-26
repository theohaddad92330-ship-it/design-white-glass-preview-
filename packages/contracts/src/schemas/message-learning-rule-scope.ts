import { z } from 'zod'

/**
 * MOTEUR D'APPRENTISSAGE DES MESSAGES — LES 5 NIVEAUX GOUVERNÉS (épopée #2877,
 * #2385.5).
 *
 * Le moteur entier (capture des signaux qualité par diff de version, règle
 * PERSISTÉE versionnée/réversible, framework A/B) reste hors de ce fichier —
 * système à plusieurs jours, documenté sur l'épopée #2877. Ce socle couvre
 * uniquement ce que #2385.5 demande en premier : que les 5 niveaux
 * (message/campagne/utilisateur/workspace/global) soient GOUVERNÉS et ne
 * puissent JAMAIS être confondus — pas une discipline de commentaire, une
 * contrainte que le schéma applique à la construction.
 *
 * Chaque niveau porte EXACTEMENT son propre identifiant de portée, jamais un
 * autre : un scope `workspace` ne peut pas aussi porter un `messageId`, un
 * scope `global` ne porte aucun identifiant (il n'y a rien à distinguer).
 */
export const MESSAGE_LEARNING_RULE_LEVELS = ['message', 'campaign', 'user', 'workspace', 'global'] as const
export const messageLearningRuleLevelSchema = z.enum(MESSAGE_LEARNING_RULE_LEVELS)
export type MessageLearningRuleLevel = z.infer<typeof messageLearningRuleLevelSchema>

export const messageLearningRuleScopeSchema = z.discriminatedUnion('level', [
  z.object({ level: z.literal('message'), messageId: z.string().min(1) }).strict(),
  z.object({ level: z.literal('campaign'), campaignId: z.string().min(1) }).strict(),
  z.object({ level: z.literal('user'), userId: z.string().min(1) }).strict(),
  z.object({ level: z.literal('workspace'), workspaceId: z.string().min(1) }).strict(),
  z.object({ level: z.literal('global') }).strict(),
])
export type MessageLearningRuleScope = z.infer<typeof messageLearningRuleScopeSchema>

const LEVEL_LABEL: Record<MessageLearningRuleLevel, string> = {
  message: 'message',
  campaign: 'campagne',
  user: 'utilisateur',
  workspace: 'espace',
  global: 'global',
}

/** Libellé humain d'une portée — DÉRIVÉ du scope, jamais un identifiant deviné. */
export function describeMessageLearningRuleScope(scope: MessageLearningRuleScope): string {
  if (scope.level === 'message') return `${LEVEL_LABEL.message} ${scope.messageId}`
  if (scope.level === 'campaign') return `${LEVEL_LABEL.campaign} ${scope.campaignId}`
  if (scope.level === 'user') return `${LEVEL_LABEL.user} ${scope.userId}`
  if (scope.level === 'workspace') return `${LEVEL_LABEL.workspace} ${scope.workspaceId}`
  return LEVEL_LABEL.global
}

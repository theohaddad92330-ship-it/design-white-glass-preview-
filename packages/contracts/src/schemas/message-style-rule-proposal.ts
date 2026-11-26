import { z } from 'zod'

/**
 * MÉMOIRE DE STYLE DES MESSAGES — LA PROPOSITION DE RÈGLE (épopée #2768,
 * LAU-FINAL-084, #2369.7/.8/.13).
 *
 * ⚠️ Le CORPS d'un message ne sort jamais vers le modèle (CLAUDE.md, doctrine
 * sur `outreach_message_versions` et les fils de messagerie). Rien ici
 * n'appelle l'IA : `observation` (ci-dessous) est une phrase COURTE écrite par
 * le service, jamais le texte intégral d'un message.
 */

/**
 * #2369.13 — LES TROIS INTERDITS D'APPRENTISSAGE, nommés.
 *
 * Ce module n'a PAS de détection automatique (orthographe, exactitude d'une
 * donnée, tonalité) : la construire exigerait d'envoyer le corps du message au
 * modèle, ce que la doctrine interdit ici. La garde est donc une POLICY sur un
 * signal DÉJÀ classé par qui propose la règle (#2369.4, l'analyse préalable,
 * reste HORS de ce socle) — jamais une supposition inventée par ce fichier.
 *
 * Les SIX valeurs admises par `signal`, apprenables ou non — la contrainte SQL
 * les couvre TOUTES (GA-12, `check-constraints-cover-enums.spec.ts`).
 * Écrite en littéral (jamais par étalement de deux tableaux) : la garde
 * n'extrait que des chaînes littérales de ce fichier.
 */
export const MESSAGE_STYLE_LEARNING_SIGNALS = [
  'wording_preference',
  'structure_preference',
  'tone_preference',
  'spelling_or_grammar_fix',
  'false_or_fabricated_data_correction',
  'isolated_aggressive_tone',
] as const

/** Les trois interdits — sous-ensemble littéral de {@link MESSAGE_STYLE_LEARNING_SIGNALS} (GA-26 : une seule liste source). */
export const EXCLUDED_STYLE_LEARNING_SIGNALS = [
  'spelling_or_grammar_fix',
  'false_or_fabricated_data_correction',
  'isolated_aggressive_tone',
] as const

export const styleLearningSignalSchema = z.enum(MESSAGE_STYLE_LEARNING_SIGNALS)
export type StyleLearningSignal = z.infer<typeof styleLearningSignalSchema>

const EXCLUDED_STYLE_LEARNING_SIGNALS_SET: ReadonlySet<string> = new Set(EXCLUDED_STYLE_LEARNING_SIGNALS)

/** #2369.13 — `false` pour les trois interdits, `true` pour tout le reste. Jamais l'inverse. */
export function isLearnableStyleSignal(signal: StyleLearningSignal): boolean {
  return !EXCLUDED_STYLE_LEARNING_SIGNALS_SET.has(signal)
}

/**
 * #2369.7/.8 — LA PROPOSITION, JAMAIS LE DURCISSEMENT AUTOMATIQUE.
 *
 * `pending` est le SEUL statut qu'une création peut produire (#2369.7) ;
 * `adopted`/`rejected` n'arrivent que par une décision explicite et séparée
 * (#2369.8), jamais par la création elle-même. Rien, dans ce schéma, ne permet
 * de créer une proposition déjà adoptée.
 */
export const MESSAGE_STYLE_RULE_PROPOSAL_STATUSES = ['pending', 'adopted', 'rejected'] as const
export const messageStyleRuleProposalStatusSchema = z.enum(MESSAGE_STYLE_RULE_PROPOSAL_STATUSES)
export type MessageStyleRuleProposalStatus = z.infer<typeof messageStyleRuleProposalStatusSchema>

export const messageStyleRuleProposalSchema = z.object({
  id: z.string().guid(),
  workspaceId: z.string().guid(),
  /** Le template visé, quand la règle en précise déjà un — `null` : une règle qui n'a pas encore de foyer. */
  templateId: z.string().guid().nullable(),
  proposedBy: z.string().guid(),
  signal: styleLearningSignalSchema,
  /**
   * Une phrase COURTE décrivant le choix observé (« retire les points
   * d'exclamation »), jamais le corps intégral d'un message — voir la note de
   * tête de ce fichier.
   */
  observation: z.string().trim().min(1).max(500),
  status: messageStyleRuleProposalStatusSchema,
  decidedBy: z.string().guid().nullable(),
  decidedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})
export type MessageStyleRuleProposal = z.infer<typeof messageStyleRuleProposalSchema>

/** Corps de création : ni `status` (naît `pending`), ni décideur — #2369.7. */
export const createMessageStyleRuleProposalSchema = z.object({
  templateId: z.string().guid().nullable().optional(),
  signal: styleLearningSignalSchema,
  observation: z.string().trim().min(1).max(500),
})
export type CreateMessageStyleRuleProposal = z.infer<typeof createMessageStyleRuleProposalSchema>

/** #2369.8 — la SEULE façon de sortir de `pending` : un geste humain explicite, nommé. */
export const MESSAGE_STYLE_RULE_PROPOSAL_DECISIONS = ['adopted', 'rejected'] as const
export const messageStyleRuleProposalDecisionSchema = z.enum(MESSAGE_STYLE_RULE_PROPOSAL_DECISIONS)
export type MessageStyleRuleProposalDecision = z.infer<typeof messageStyleRuleProposalDecisionSchema>

/** Corps de `POST /message-style/rule-proposals/:id/decide` — #2369.8. */
export const decideMessageStyleRuleProposalRequestSchema = z.object({
  decision: messageStyleRuleProposalDecisionSchema,
})
export type DecideMessageStyleRuleProposalRequest = z.infer<typeof decideMessageStyleRuleProposalRequestSchema>

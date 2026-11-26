import { z } from 'zod'
import { methodRuleDomainSchema } from './method-corpus.js'

/**
 * BEL-SC-243 — APPRENTISSAGE CONTRÔLÉ (#3272.5) : la SEULE porte par laquelle
 * un REX de perte peut, un jour, devenir une règle générale.
 *
 * La spec pose six conditions à cette transformation : plusieurs cas
 * convergents, validation humaine, absence de biais évident, versioning, test
 * A/B ou eval, possibilité de rollback. Ce module en tient deux STRUCTURELLEMENT
 * (les deux qui peuvent l'être par un schéma plutôt que par une revue) :
 *
 *  - **Plusieurs cas convergents** — `convergent_rex_ids` a un plancher de
 *    DEUX à même le schéma (`.min(2)`) : une proposition citant un seul REX ne
 *    peut pas même être créée. `lost-deal-rule-proposal.no-go.test.ts` le
 *    prouve en essayant.
 *  - **Validation humaine** — mêmes trois statuts que
 *    `message-style-rule-proposal.ts` (`pending`/`adopted`/`rejected`), et la
 *    MÊME garde : `createLostDealRuleProposalSchema` ne porte aucun champ
 *    `status` — une création ne peut produire QUE `pending`. Sortir de
 *    `pending` exige `decideLostDealRuleProposalRequestSchema`, un geste
 *    humain séparé et explicite.
 *
 * Ce qui RESTE, nommé plutôt que simulé : l'absence de biais évident (revue
 * humaine au moment de la décision, non outillée), le versioning et le
 * rollback réels (une proposition ADOPTÉE n'écrit encore nulle part dans
 * `method-corpus.ts` — la cible existe, `methodRuleGovernanceSchema` porte
 * déjà `enabled`/`disabled_reason`, mais le pont n'est pas câblé), et le test
 * A/B ou eval (aucun mécanisme d'expérimentation sur une règle promue). Ce
 * sont des chantiers séparés, portés par l'épopée de ce lot — pas un moteur
 * concurrent à réinventer ici (instruction commune #3249, règle 4) : le jour
 * où l'écriture existe, elle passe par `MethodRuleGovernance`, jamais par un
 * second objet de gouvernance.
 */

export const LOST_DEAL_RULE_PROPOSAL_STATUSES = ['pending', 'adopted', 'rejected'] as const
export const lostDealRuleProposalStatusSchema = z.enum(LOST_DEAL_RULE_PROPOSAL_STATUSES)
export type LostDealRuleProposalStatus = z.infer<typeof lostDealRuleProposalStatusSchema>

export const lostDealRuleProposalSchema = z.object({
  id: z.string().guid(),
  workspace_id: z.string().guid(),
  domain: methodRuleDomainSchema,
  /** « Plusieurs cas convergents » — jamais un REX isolé (NO-GO, #3272.7). */
  convergent_rex_ids: z.array(z.string().guid()).min(2),
  /** Une phrase courte, jamais le contenu intégral des REX cités. */
  observation: z.string().trim().min(1).max(500),
  status: lostDealRuleProposalStatusSchema,
  proposed_by: z.string().guid(),
  decided_by: z.string().guid().nullable(),
  decided_at: z.string().nullable(),
  created_at: z.string(),
})
export type LostDealRuleProposal = z.infer<typeof lostDealRuleProposalSchema>

/** Corps de création : ni `status` (naît toujours `pending`), ni décideur. */
export const createLostDealRuleProposalSchema = z.object({
  domain: methodRuleDomainSchema,
  convergent_rex_ids: z.array(z.string().guid()).min(2),
  observation: z.string().trim().min(1).max(500),
})
export type CreateLostDealRuleProposal = z.infer<typeof createLostDealRuleProposalSchema>

/** La SEULE façon de sortir de `pending` — un geste humain explicite, nommé. */
export const LOST_DEAL_RULE_PROPOSAL_DECISIONS = ['adopted', 'rejected'] as const
export const lostDealRuleProposalDecisionSchema = z.enum(LOST_DEAL_RULE_PROPOSAL_DECISIONS)
export type LostDealRuleProposalDecision = z.infer<typeof lostDealRuleProposalDecisionSchema>

/** Corps de `POST /capitalisation/lost-deal-rule-proposals/:id/decide`. */
export const decideLostDealRuleProposalRequestSchema = z.object({
  decision: lostDealRuleProposalDecisionSchema,
})
export type DecideLostDealRuleProposalRequest = z.infer<typeof decideLostDealRuleProposalRequestSchema>

// ── Revue de biais au moment de la décision (#3295) ─────────────────────────

/**
 * Les familles de CRITÈRES PROTÉGÉS (doctrine : « aucun critère protégé ne pèse
 * dans le rang d'une personne »). Une observation qui en invoque une ne peut pas
 * devenir une règle de Laura : elle ressemble à une règle, elle ferait une
 * discrimination. Identifiants stables (`age`, `gender`…), jamais un texte
 * affiché tel quel — l'écran les traduit.
 */
const BIAS_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['age', /\b(age|ages|agee?s?|jeunes?|vieux|vieille|\d+ ans)\b/],
  ['gender', /\b(genre|sexe|homme|hommes|femme|femmes|masculin|feminin|gender|male|female)\b/],
  ['origin', /\b(origine ethnique|nationalite|ethnie|ethnique|race|racial|religion|religieux|accent)\b/],
  ['photo', /\b(photo|photos|apparence)\b/],
  ['address', /\b(domicile|adresse personnelle)\b/],
  ['health', /\b(handicap|handicape|enceinte|grossesse|maladie)\b/],
]

/**
 * La revue de biais OUTILLÉE : renvoie les familles de critères protégés
 * qu'une observation invoque (`[]` = aucune détectée). Ce n'est pas une preuve
 * d'absence de biais — c'est un filtre qui sait dire NON à l'évident. La
 * décision reste humaine, mais elle ne peut pas ADOPTER ce que le filtre
 * refuse.
 */
export function lostDealRuleBiasFlags(text: string): string[] {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return BIAS_PATTERNS.filter(([, pattern]) => pattern.test(normalized)).map(([flag]) => flag)
}

// ── La promotion réelle (#3295) ─────────────────────────────────────────────

/**
 * Raison inscrite à la naissance d'une règle promue : adopter une proposition
 * ne l'ACTIVE jamais — la revue d'activation est un geste séparé, qui porte
 * son propre auteur. Clé stable, traduite à l'écran.
 */
export const WORKSPACE_RULE_PENDING_REVIEW = 'activation_review_pending'

/**
 * Une règle promue d'un espace. Même gouvernance que `methodRuleGovernanceSchema`
 * (`owner`, `enabled`, `disabled_reason`) — jamais un second objet de
 * gouvernance : désactivée sans raison est refusée, comme au corpus.
 */
export const workspaceMethodRuleSchema = z
  .object({
    id: z.string().guid(),
    workspace_id: z.string().guid(),
    proposal_id: z.string().guid(),
    domain: methodRuleDomainSchema,
    statement: z.string().trim().min(1).max(500),
    owner: z.string().guid().nullable(),
    enabled: z.boolean(),
    disabled_reason: z.string().min(1).nullable(),
    promoted_at: z.string(),
    activated_by: z.string().guid().nullable(),
    activated_at: z.string().nullable(),
  })
  .superRefine((rule, ctx) => {
    if (!rule.enabled && !rule.disabled_reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['disabled_reason'],
        message: 'Une règle désactivée doit porter sa raison — jamais un silence.',
      })
    }
  })
export type WorkspaceMethodRule = z.infer<typeof workspaceMethodRuleSchema>

/** Le geste d'activation / de rollback : désactiver exige sa raison. */
export const setWorkspaceMethodRuleActivationSchema = z
  .object({
    enabled: z.boolean(),
    reason: z.string().trim().min(1).max(300).optional(),
  })
  .superRefine((body, ctx) => {
    if (!body.enabled && !body.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'Désactiver une règle exige sa raison.',
      })
    }
  })
export type SetWorkspaceMethodRuleActivation = z.infer<typeof setWorkspaceMethodRuleActivationSchema>

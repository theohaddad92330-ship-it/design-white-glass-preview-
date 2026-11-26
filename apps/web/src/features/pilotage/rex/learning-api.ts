import type {
  LearnedRuleOutcomeTally,
  CreateLostDealRuleProposal,
  LostDealRex,
  LostDealRuleProposal,
  LostDealRuleProposalDecision,
  SetWorkspaceMethodRuleActivation,
  WorkspaceMethodRule,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #3295 — l'APPRENTISSAGE CONTRÔLÉ côté web : le premier appelant des
 * propositions de règle (`POST`/`PATCH decide` existaient sans aucun écran).
 * Les formes viennent de `@bellum/contracts` — jamais recopiées ici.
 */
export const LEARNING_KEYS = {
  rex: ['lost-deal-learning', 'rex'] as const,
  proposals: ['lost-deal-learning', 'proposals'] as const,
  rules: ['lost-deal-learning', 'rules'] as const,
  outcomes: ['lost-deal-learning', 'outcomes'] as const,
}

export const lostDealLearningApi = {
  rex(): Promise<{ items: LostDealRex[] }> {
    return apiFetch<{ items: LostDealRex[] }>({ path: '/capitalisation/lost-deal-rex' })
  },
  proposals(): Promise<{ items: LostDealRuleProposal[] }> {
    return apiFetch<{ items: LostDealRuleProposal[] }>({ path: '/capitalisation/lost-deal-rule-proposals' })
  },
  rules(): Promise<{ items: WorkspaceMethodRule[] }> {
    return apiFetch<{ items: WorkspaceMethodRule[] }>({ path: '/capitalisation/workspace-method-rules' })
  },
  /** #3295 — les actions posées sous chaque règle apprise, comptées par issue. */
  outcomes(): Promise<{ items: LearnedRuleOutcomeTally[] }> {
    return apiFetch<{ items: LearnedRuleOutcomeTally[] }>({ path: '/capitalisation/workspace-method-rules/outcomes' })
  },
  propose(input: CreateLostDealRuleProposal): Promise<LostDealRuleProposal> {
    return apiFetch<LostDealRuleProposal, CreateLostDealRuleProposal>({
      path: '/capitalisation/lost-deal-rule-proposals',
      method: 'POST',
      body: input,
    })
  },
  decide(
    id: string,
    decision: LostDealRuleProposalDecision,
  ): Promise<{ proposal: LostDealRuleProposal; rule: WorkspaceMethodRule | null }> {
    return apiFetch<
      { proposal: LostDealRuleProposal; rule: WorkspaceMethodRule | null },
      { decision: LostDealRuleProposalDecision }
    >({ path: `/capitalisation/lost-deal-rule-proposals/${id}/decide`, method: 'PATCH', body: { decision } })
  },
  setActivation(id: string, input: SetWorkspaceMethodRuleActivation): Promise<WorkspaceMethodRule> {
    return apiFetch<WorkspaceMethodRule, SetWorkspaceMethodRuleActivation>({
      path: `/capitalisation/workspace-method-rules/${id}/activation`,
      method: 'PATCH',
      body: input,
    })
  },
}

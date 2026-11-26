import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  lostDealRuleBiasFlags,
  tallyLearnedRuleOutcomes,
  type LearnedRuleOutcomeTally,
  WORKSPACE_RULE_PENDING_REVIEW,
  type LostDealRuleProposal,
  type LostDealRuleProposalDecision,
  type SetWorkspaceMethodRuleActivation,
  type WorkspaceMethodRule,
} from '@bellum/contracts'
import { Repository } from 'typeorm'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { LostDealRuleProposalEntity } from '../../database/entities/lost-deal-rule-proposal.entity'
import { WorkspaceMethodRuleEntity } from '../../database/entities/workspace-method-rule.entity'
import { CapitalisationService } from './capitalisation.service'

/**
 * #3295 — le pont « apprentissage contrôlé » → règle réelle de l'espace.
 *
 * Trois gestes, trois portes, jamais fusionnés :
 *  1. la DÉCISION humaine (`decide`) — adopter exige que la revue de biais
 *     outillée (`lostDealRuleBiasFlags`) ne lève rien ; rejeter reste toujours
 *     possible ;
 *  2. la PROMOTION — adopter écrit une règle qui naît `enabled = false`, avec
 *     sa raison : l'adoption ne change jamais ce que Laura dit ;
 *  3. l'ACTIVATION (`setActivation`) — un geste séparé, qui porte son auteur ;
 *     la désactiver est le rollback, et exige sa raison.
 */
@Injectable()
export class WorkspaceMethodRulesService {
  constructor(
    @InjectRepository(WorkspaceMethodRuleEntity)
    private readonly rules: Repository<WorkspaceMethodRuleEntity>,
    @InjectRepository(LostDealRuleProposalEntity)
    private readonly proposals: Repository<LostDealRuleProposalEntity>,
    private readonly capitalisation: CapitalisationService,
    // #3295 — LECTURE SEULE : les actions posées sous une règle apprise.
    @Optional()
    @InjectRepository(ActionPlanItemEntity)
    private readonly items?: Repository<ActionPlanItemEntity>,
  ) {}

  async decide(
    workspaceId: string,
    userId: string,
    proposalId: string,
    decision: LostDealRuleProposalDecision,
  ): Promise<{ proposal: LostDealRuleProposal; rule: WorkspaceMethodRule | null }> {
    const proposal = await this.proposals.findOne({ where: { id: proposalId, workspace_id: workspaceId } })
    if (!proposal) throw new NotFoundException('Proposition introuvable dans cet espace.')

    if (decision === 'adopted') {
      const flags = lostDealRuleBiasFlags(proposal.observation)
      if (flags.length > 0) {
        throw new BadRequestException(
          `Revue de biais : l’observation invoque un critère protégé (${flags.join(', ')}) — elle ne peut pas devenir une règle.`,
        )
      }
    }

    const decided = await this.capitalisation.decideLostDealRuleProposal(workspaceId, userId, proposalId, decision)
    if (decision !== 'adopted') return { proposal: decided, rule: null }

    const saved = await this.rules.save(
      this.rules.create({
        workspace_id: workspaceId,
        proposal_id: proposalId,
        domain: proposal.domain,
        statement: proposal.observation,
        owner: userId,
        enabled: false,
        disabled_reason: WORKSPACE_RULE_PENDING_REVIEW,
        activated_by: null,
        activated_at: null,
      }),
    )
    return { proposal: decided, rule: toWire(saved) }
  }

  async list(workspaceId: string): Promise<WorkspaceMethodRule[]> {
    const rows = await this.rules.find({ where: { workspace_id: workspaceId }, order: { promoted_at: 'DESC' } })
    return rows.map(toWire)
  }

  /**
   * #3295 — la MESURE par règle : combien d'actions ont été posées sous elle et
   * ce que leurs issues déclarées en disent. Des comptes, jamais un taux ni une
   * comparaison « avec / sans » devinée ; une règle jamais suivie ne fait aucune
   * ligne. Bornée à l'espace par le compte de l'action.
   */
  async outcomes(workspaceId: string): Promise<LearnedRuleOutcomeTally[]> {
    if (!this.items) return []
    const rows = await this.items
      .createQueryBuilder('item')
      .innerJoin('accounts', 'account', 'account.id = item.account_id')
      .select([
        'item.method_rule AS method_rule',
        'item.outcome AS outcome',
        'item.execution_status AS execution_status',
      ])
      .where("item.method_rule LIKE 'learned:%'")
      .andWhere('account.workspace_id = :workspaceId', { workspaceId })
      .getRawMany<{ method_rule: string | null; outcome: string | null; execution_status: string }>()
    return tallyLearnedRuleOutcomes(rows)
  }

  /** Ce que Laura peut citer : UNIQUEMENT les règles activées de cet espace. */
  async enabledForWorkspace(workspaceId: string): Promise<WorkspaceMethodRule[]> {
    const rows = await this.rules.find({
      where: { workspace_id: workspaceId, enabled: true },
      order: { promoted_at: 'DESC' },
      take: ACTIVE_RULES_MAX,
    })
    return rows.map(toWire)
  }

  async setActivation(
    workspaceId: string,
    userId: string,
    id: string,
    input: SetWorkspaceMethodRuleActivation,
  ): Promise<WorkspaceMethodRule> {
    const rule = await this.rules.findOne({ where: { id, workspace_id: workspaceId } })
    if (!rule) throw new NotFoundException('Règle introuvable dans cet espace.')

    if (input.enabled) {
      rule.enabled = true
      rule.disabled_reason = null
      rule.activated_by = userId
      rule.activated_at = new Date()
    } else {
      const reason = input.reason?.trim()
      if (!reason) throw new BadRequestException('Désactiver une règle exige sa raison.')
      rule.enabled = false
      rule.disabled_reason = reason
    }
    return toWire(await this.rules.save(rule))
  }
}

/** Borne du contexte injecté à Laura : quelques règles, pas un manuel. */
const ACTIVE_RULES_MAX = 5

function toWire(row: WorkspaceMethodRuleEntity): WorkspaceMethodRule {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    proposal_id: row.proposal_id,
    domain: row.domain as WorkspaceMethodRule['domain'],
    statement: row.statement,
    owner: row.owner ?? null,
    enabled: row.enabled,
    disabled_reason: row.disabled_reason ?? null,
    promoted_at: new Date(row.promoted_at).toISOString(),
    activated_by: row.activated_by ?? null,
    activated_at: row.activated_at ? new Date(row.activated_at).toISOString() : null,
  }
}

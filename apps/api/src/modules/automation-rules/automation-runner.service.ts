import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, MoreThanOrEqual, Repository } from 'typeorm'
import {
  AUTOMATION_RULE_LIMITS,
  automationPreparationCost,
  type AutomationOutcome,
  type OutreachPlaybookKey,
} from '@bellum/contracts'
import { AutomationRuleEntity } from '../../database/entities/automation-rule.entity'
import { AutomationRuleFiringEntity } from '../../database/entities/automation-rule-firing.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { planRuleRun, type RunStep, type SignalCandidate } from './automation-engine'
import { AUTOMATION_ACTIONS_PORT, type AutomationActionsPort } from './automation-ports'
import { AutomationSignalReader } from './automation-signal-reader'

const DAY_MS = 86_400_000

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
}

/**
 * Lot L-D1 (#4167) — LA PRÉPARATION DU MATIN : fait inscrire par chaque règle
 * ACTIVE les contacts concernés par un signal, en respectant les exclusions de
 * l'outreach (déjà en séquence active, contacté il y a moins de 30 jours,
 * opposition RGPD, compte client), puis consigne ce que chaque règle a fait.
 *
 * Rien ne part : une inscription laisse les étapes à faire, un message naît
 * `needs_review` dans « À traiter » (source « automatisation », le signal en
 * « pourquoi maintenant »), et sa validation reste un geste humain sous mandat
 * (c82). Mono-contact (c74) : un signal, un contact.
 *
 * Idempotente : `(rule_id, signal_ref)` est unique, un second passage ne refait
 * rien. L'échec d'une règle ou d'un signal ne prive pas les autres de leur matin.
 */
@Injectable()
export class AutomationRunnerService {
  private readonly logger = new Logger(AutomationRunnerService.name)

  constructor(
    @InjectRepository(AutomationRuleEntity) private readonly rules: Repository<AutomationRuleEntity>,
    @InjectRepository(AutomationRuleFiringEntity) private readonly firings: Repository<AutomationRuleFiringEntity>,
    @InjectRepository(WorkspaceMemberEntity) private readonly members: Repository<WorkspaceMemberEntity>,
    private readonly reader: AutomationSignalReader,
    @Inject(AUTOMATION_ACTIONS_PORT) private readonly actions: AutomationActionsPort,
  ) {}

  /** Toutes les règles actives, hors espaces de démonstration (la démo n'agit sur rien). */
  async runAll(now: Date = new Date()): Promise<{ rules: number; acted: number }> {
    const active = await this.rules.find({ where: { enabled: true } })
    if (active.length === 0) return { rules: 0, acted: 0 }
    const demo = await this.rules.manager.query<{ id: string }[]>(
      `SELECT id FROM workspaces WHERE id = ANY($1::uuid[]) AND is_demo = true`,
      [[...new Set(active.map(rule => rule.workspace_id))]],
    )
    const demoIds = new Set(demo.map(row => row.id))
    let acted = 0
    let ran = 0
    for (const rule of active.filter(candidate => !demoIds.has(candidate.workspace_id))) {
      try {
        const result = await this.runRule(rule, now)
        if (result.ran) ran += 1
        acted += result.acted
      } catch (error) {
        // L'échec d'une règle ne prive pas les autres de leur matin.
        this.logger.warn('automation rule run failed (non-fatal)', {
          ruleId: rule.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return { rules: ran, acted }
  }

  async runRule(rule: AutomationRuleEntity, now: Date): Promise<{ ran: boolean; acted: number }> {
    // La personne a-t-elle quitté l'espace ? Rien n'agit au nom de quelqu'un qui n'y est plus.
    const member = await this.members.findOne({ where: { workspace_id: rule.workspace_id, user_id: rule.user_id } })
    if (!member) return { ran: false, acted: 0 }

    const { readable, candidates } = await this.reader.read(rule, now)
    // Source illisible : la règle n'a PAS tourné. `last_run_at` ne bouge pas, le compteur reste « non mesuré ».
    if (!readable) return { ran: false, acted: 0 }

    const { plan, byRef } = await this.planFor(rule, candidates, now)

    let acted = 0
    for (const step of plan) {
      const outcome = await this.execute(rule, step, member.role)
      if (outcome.outcome === 'enrolled' || outcome.outcome === 'prepared') acted += 1
      await this.record(rule, step.candidate, outcome, byRef.get(step.candidate.signalRef))
    }
    await this.rules.update({ id: rule.id }, { last_run_at: now })
    return { ran: true, acted }
  }

  /**
   * Théo C automations-editeur — l'ESSAI : ce que la règle (ou son brouillon) ferait ce matin, SANS rien écrire — ni
   * inscription, ni message, ni ligne du journal des déclenchements. Le même plan que le passage du matin, jamais un
   * second calcul.
   */
  async preview(
    rule: AutomationRuleEntity,
    now: Date,
  ): Promise<{ readable: boolean; candidates: SignalCandidate[]; plan: RunStep[] }> {
    const { readable, candidates } = await this.reader.read(rule, now)
    if (!readable) return { readable: false, candidates: [], plan: [] }
    const { plan } = await this.planFor(rule, candidates, now)
    return { readable: true, candidates, plan }
  }

  private async planFor(
    rule: AutomationRuleEntity,
    candidates: SignalCandidate[],
    now: Date,
  ): Promise<{ plan: RunStep[]; byRef: Map<string, AutomationRuleFiringEntity> }> {
    const existing = candidates.length
      ? await this.firings.find({ where: { rule_id: rule.id, signal_ref: In(candidates.map(c => c.signalRef)) } })
      : []
    const byRef = new Map(existing.map(row => [row.signal_ref, row]))
    // `cap_reached` n'est pas définitif : le signal est repris quand le plafond le permet.
    const knownRefs = new Set(existing.filter(row => row.outcome !== 'cap_reached').map(row => row.signal_ref))

    const contactIds = candidates.flatMap(c => (c.contactId && !knownRefs.has(c.signalRef) ? [c.contactId] : []))
    const exclusionsByContact = await this.actions.eligibility({
      userId: rule.user_id,
      workspaceId: rule.workspace_id,
      contactIds,
    })

    const since = new Date(now.getTime() - AUTOMATION_RULE_LIMITS.windowDays * DAY_MS)
    const recent = await this.firings.find({
      where: { rule_id: rule.id, fired_at: MoreThanOrEqual(since) },
      select: ['credits_spent'],
    })
    const creditsSpent = recent.reduce((sum, row) => sum + row.credits_spent, 0)

    const plan = planRuleRun({
      candidates,
      knownRefs,
      exclusionsByContact,
      creditCap: rule.credit_cap,
      creditsSpent,
      cost: automationPreparationCost(),
      maxPerRun: AUTOMATION_RULE_LIMITS.maxPerRun,
    })
    return { plan, byRef }
  }

  private async execute(
    rule: AutomationRuleEntity,
    step: RunStep,
    role: WorkspaceMemberEntity['role'],
  ): Promise<{
    outcome: AutomationOutcome
    reason: string | null
    sequenceId?: string | null
    messageId?: string | null
    credits?: number
  }> {
    if (step.type === 'record') return { outcome: step.outcome, reason: step.reason }
    const { candidate } = step
    const base = {
      userId: rule.user_id,
      email: '',
      workspaceId: rule.workspace_id,
      role,
      contactId: candidate.contactId as string,
      signal: rule.signal,
      evidence: candidate.evidence,
    }
    try {
      if (rule.action_kind === 'enroll_sequence') {
        const result = await this.actions.enroll({ ...base, playbook: rule.playbook_key as OutreachPlaybookKey })
        return {
          outcome: 'enrolled',
          reason: null,
          sequenceId: result.sequenceId,
          messageId: result.messageIds[0] ?? null,
          credits: step.cost,
        }
      }
      if (rule.prepared_action === 'call_to_make') {
        await this.actions.prepareCall(base)
        return { outcome: 'prepared', reason: null, credits: step.cost }
      }
      const email = await this.actions.prepareEmail(base)
      if (!email) return { outcome: 'failed', reason: 'Laura n’a rien pu rédiger pour ce signal.' }
      return { outcome: 'prepared', reason: null, messageId: email.messageId, credits: step.cost }
    } catch (error) {
      // Un refus de l'outreach (exclusion apparue entre-temps, niveau d'approbation de l'espace…) se consigne et se nomme.
      return { outcome: 'failed', reason: (error instanceof Error ? error.message : String(error)).slice(0, 300) }
    }
  }

  private async record(
    rule: AutomationRuleEntity,
    candidate: SignalCandidate,
    result: {
      outcome: AutomationOutcome
      reason: string | null
      sequenceId?: string | null
      messageId?: string | null
      credits?: number
    },
    existing: AutomationRuleFiringEntity | undefined,
  ): Promise<void> {
    const row = existing ?? this.firings.create({ rule_id: rule.id, signal_ref: candidate.signalRef })
    Object.assign(row, {
      workspace_id: rule.workspace_id,
      user_id: rule.user_id,
      signal: rule.signal,
      contact_id: candidate.contactId,
      account_id: candidate.accountId,
      outcome: result.outcome,
      reason: result.reason,
      sequence_id: result.sequenceId ?? null,
      message_id: result.messageId ?? null,
      credits_spent: result.credits ?? 0,
      fired_at: new Date(),
    })
    try {
      await this.firings.save(row)
    } catch (error) {
      // Un autre processus a consigné ce même signal : rien à refaire (le journal est unique par signal).
      if (!isUniqueViolation(error)) throw error
    }
  }
}

import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, MoreThanOrEqual, Repository } from 'typeorm'
import {
  AUTOMATION_RULE_LIMITS,
  automationPreparationCost,
  countAutomationFirings,
  type AutomationOutcome,
  type AutomationRuleView,
  type CreateAutomationRuleRequest,
  type SaveAutomationRuleDraftRequest,
  type UpdateAutomationRuleRequest,
} from '@bellum/contracts'
import { AutomationRuleEntity } from '../../database/entities/automation-rule.entity'
import { AutomationRuleFiringEntity } from '../../database/entities/automation-rule-firing.entity'

const DAY_MS = 86_400_000

/** Les issues qui disent « la règle a vu le signal mais n'a pas agi ». */
const SKIPPED_OUTCOMES: readonly AutomationOutcome[] = ['excluded', 'no_contact', 'cap_reached', 'failed']

/** La phrase de la règle qui tourne, lue comme un brouillon : la base sur laquelle une modification devient la version suivante. */
function draftOf(row: AutomationRuleEntity): SaveAutomationRuleDraftRequest {
  return {
    name: row.name,
    signal: row.signal,
    action_kind: row.action_kind,
    playbook_key: row.playbook_key,
    prepared_action: row.prepared_action,
    inactive_days: row.inactive_days,
    credit_cap: row.credit_cap,
  }
}

/**
 * Lot L-D1 (#4167) — les règles d'automatisation d'une PERSONNE dans son espace :
 * lister (avec les compteurs des 30 jours), créer (éteinte), allumer / éteindre,
 * plafonner, supprimer.
 *
 * L'espace est résolu par le contrôleur (GA-07) ; chaque lecture et chaque écriture
 * est bornée par `(workspace_id, user_id)` — jamais d'accès par identifiant seul.
 *
 * Les compteurs sont des COMPTAGES du journal (`automation_rule_firings`), jamais
 * une estimation ; une règle qui n'a jamais tourné est « non mesurée » (`null`).
 */
@Injectable()
export class AutomationRulesService {
  constructor(
    @InjectRepository(AutomationRuleEntity) private readonly rules: Repository<AutomationRuleEntity>,
    @InjectRepository(AutomationRuleFiringEntity) private readonly firings: Repository<AutomationRuleFiringEntity>,
  ) {}

  async list(workspaceId: string, userId: string, now: Date = new Date()): Promise<AutomationRuleView[]> {
    const rows = await this.rules.find({
      // Théo C automations-editeur.R3 — une règle archivée sort de la liste (on archive, on ne supprime pas).
      where: { workspace_id: workspaceId, user_id: userId, archived_at: IsNull() },
      order: { created_at: 'ASC' },
    })
    if (rows.length === 0) return []
    const since = new Date(now.getTime() - AUTOMATION_RULE_LIMITS.windowDays * DAY_MS)
    const recent = await this.firings.find({
      where: { rule_id: In(rows.map(row => row.id)), fired_at: MoreThanOrEqual(since) },
    })
    return rows.map(row => {
      const own = recent.filter(firing => firing.rule_id === row.id)
      const lastRunAt = row.last_run_at ? row.last_run_at.toISOString() : null
      const measured = lastRunAt !== null
      return {
        id: row.id,
        signal: row.signal,
        action_kind: row.action_kind,
        playbook_key: row.playbook_key,
        prepared_action: row.prepared_action,
        inactive_days: row.inactive_days,
        enabled: row.enabled,
        credit_cap: row.credit_cap,
        credit_cost: automationPreparationCost(),
        firings_30d: countAutomationFirings(
          own.map(firing => ({ outcome: firing.outcome, fired_at: firing.fired_at.toISOString() })),
          lastRunAt,
          now,
        ),
        skipped_30d: measured ? own.filter(firing => SKIPPED_OUTCOMES.includes(firing.outcome)).length : null,
        credits_spent_30d: measured ? own.reduce((sum, firing) => sum + firing.credits_spent, 0) : null,
        last_run_at: lastRunAt,
        template_key: row.template_key,
        created_at: row.created_at.toISOString(),
        name: row.name ?? null,
        version: row.version ?? 1,
        draft: row.draft
          ? {
              name: row.draft.name ?? null,
              signal: row.draft.signal,
              action_kind: row.draft.action_kind,
              playbook_key: row.draft.playbook_key ?? null,
              prepared_action: row.draft.prepared_action ?? null,
              inactive_days: row.draft.inactive_days ?? null,
              credit_cap: row.draft.credit_cap ?? null,
              tested: row.draft_tested_at != null,
            }
          : null,
      }
    })
  }

  /** La vue d'UNE règle de la personne (liste bornée, puis choix) ; 404 si elle n'est pas à elle ou archivée. */
  async viewOf(workspaceId: string, userId: string, id: string): Promise<AutomationRuleView> {
    const view = (await this.list(workspaceId, userId)).find(candidate => candidate.id === id)
    if (!view) throw new NotFoundException('Règle introuvable.')
    return view
  }

  /**
   * Une règle naît ÉTEINTE (un geste humain l'allume). Une règle identique (même
   * signal, même action, même modèle) n'est pas dupliquée : on rend l'existante.
   */
  async create(workspaceId: string, userId: string, dto: CreateAutomationRuleRequest): Promise<AutomationRuleView> {
    const same = await this.rules.findOne({
      where: {
        workspace_id: workspaceId,
        user_id: userId,
        signal: dto.signal,
        action_kind: dto.action_kind,
        // `IS NULL` explicite : `{ col: null }` ne matche pas une colonne nulle avec TypeORM.
        playbook_key: dto.playbook_key ?? IsNull(),
        prepared_action: dto.prepared_action ?? IsNull(),
        inactive_days: dto.inactive_days ?? IsNull(),
      },
    })
    const row =
      same ??
      (await this.rules.save(
        this.rules.create({
          workspace_id: workspaceId,
          user_id: userId,
          signal: dto.signal,
          action_kind: dto.action_kind,
          playbook_key: dto.playbook_key ?? null,
          prepared_action: dto.prepared_action ?? null,
          inactive_days: dto.inactive_days ?? null,
          credit_cap: dto.credit_cap ?? null,
          template_key: dto.template_key ?? null,
          enabled: false,
          last_run_at: null,
        }),
      ))
    const view = (await this.list(workspaceId, userId)).find(candidate => candidate.id === row.id)
    if (!view) throw new NotFoundException('Règle introuvable.')
    return view
  }

  async update(
    workspaceId: string,
    userId: string,
    id: string,
    patch: UpdateAutomationRuleRequest,
  ): Promise<AutomationRuleView> {
    const row = await this.rules.findOne({ where: { id, workspace_id: workspaceId, user_id: userId } })
    if (!row) throw new NotFoundException('Règle introuvable.')
    const wasRunning = row.enabled && !row.archived_at
    if (patch.enabled !== undefined) row.enabled = patch.enabled
    if (patch.credit_cap !== undefined) {
      // Une règle qu'on allume dans le même geste n'a encore rien servi : le plafond est posé avec l'interrupteur.
      const stillRunning = wasRunning && row.enabled
      if (stillRunning && (patch.credit_cap ?? null) !== (row.credit_cap ?? null)) {
        // #2399.6 — une règle ACTIVE ne change jamais en silence : le plafond est une modification de ce qui tourne, il
        // devient la version suivante (un brouillon à tester, comparer, puis basculer). Éteindre reste immédiat.
        row.draft = { ...(row.draft ?? draftOf(row)), credit_cap: patch.credit_cap }
        row.draft_tested_at = null
        row.draft_compared_at = null
      } else if (!stillRunning) {
        row.credit_cap = patch.credit_cap
      }
    }
    await this.rules.save(row)
    const view = (await this.list(workspaceId, userId)).find(candidate => candidate.id === row.id)
    if (!view) throw new NotFoundException('Règle introuvable.')
    return view
  }

  async remove(workspaceId: string, userId: string, id: string): Promise<void> {
    const result = await this.rules.delete({ id, workspace_id: workspaceId, user_id: userId })
    if ((result.affected ?? 0) === 0) throw new NotFoundException('Règle introuvable.')
  }
}

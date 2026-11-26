import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import {
  diffAutomationVersions,
  type AutomationRuleVersionSnapshot,
  type AutomationRuleView,
  type AutomationSwitchImpact,
  type AutomationSwitchPreviewView,
  type AutomationTrialView,
  type AutomationVersionPhrase,
  type SaveAutomationRuleDraftRequest,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { AutomationRuleEntity } from '../../database/entities/automation-rule.entity'
import { AutomationRuleFiringEntity } from '../../database/entities/automation-rule-firing.entity'
import { AutomationRuleTrialEntity } from '../../database/entities/automation-rule-trial.entity'
import { AutomationRulesService } from './automation-rules.service'
import { AutomationRunnerService } from './automation-runner.service'

/** Le journal montre les essais récents, pas toute l'histoire. */
const TRIALS_LIMIT = 100

/**
 * Théo C automations-editeur — l'ÉDITEUR d'une règle : le brouillon qui se teste avant de devenir la version suivante,
 * la copie, l'archivage, et le journal des essais.
 *
 * Trois promesses, toutes tenues ici :
 *  - modifier une règle ne touche JAMAIS celle qui tourne : la phrase en attente vit dans `draft` ;
 *  - un brouillon ne s'active qu'APRÈS un essai réussi, et chaque enregistrement du brouillon efface cet essai ;
 *  - un essai lit les vraies données et n'écrit que sa propre ligne de journal — ni tâche, ni message, ni inscription ;
 *  - #2399.6/#2399.7 — la bascule MONTRE avant de basculer (ancienne / nouvelle version, différences, migration, impact,
 *    en lecture seule) et GARDE l'ancienne version ; elle refuse de s'opérer tant que la comparaison n'a pas été rendue.
 *
 * Chaque lecture et chaque écriture est bornée par `(workspace_id, user_id)` : l'espace est résolu par le contrôleur
 * (GA-07), jamais d'accès par identifiant seul.
 */
@Injectable()
export class AutomationRuleEditorService {
  constructor(
    @InjectRepository(AutomationRuleEntity) private readonly rules: Repository<AutomationRuleEntity>,
    @InjectRepository(AutomationRuleTrialEntity) private readonly trials: Repository<AutomationRuleTrialEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    private readonly rulesService: AutomationRulesService,
    private readonly runner: AutomationRunnerService,
    @InjectRepository(AutomationRuleFiringEntity) private readonly firings: Repository<AutomationRuleFiringEntity>,
  ) {}

  private async own(workspaceId: string, userId: string, id: string): Promise<AutomationRuleEntity> {
    const row = await this.rules.findOne({
      where: { id, workspace_id: workspaceId, user_id: userId, archived_at: IsNull() },
    })
    if (!row) throw new NotFoundException('Règle introuvable.')
    return row
  }

  async saveDraft(
    workspaceId: string,
    userId: string,
    id: string,
    draft: SaveAutomationRuleDraftRequest,
  ): Promise<AutomationRuleView> {
    const row = await this.own(workspaceId, userId, id)
    row.draft = draft
    row.draft_tested_at = null
    row.draft_compared_at = null
    await this.rules.save(row)
    return this.rulesService.viewOf(workspaceId, userId, id)
  }

  /**
   * L'essai de la règle — son brouillon s'il en a un, la règle qui tourne sinon. Lit sans rien créer. Une source
   * illisible se NOMME et ne valide rien : on ne compte pas « 0 situation » quand on n'a rien pu lire.
   */
  async runTrial(
    workspaceId: string,
    userId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<AutomationTrialView> {
    const row = await this.own(workspaceId, userId, id)
    const target = row.draft ? 'draft' : 'live'
    const subject = row.draft ? asDraftSubject(row, row.draft) : row
    const name = (row.draft ? row.draft.name : null) ?? row.name ?? ''

    const preview = await this.runner.preview(subject, now)
    const labels = preview.readable ? await this.labelsOf(workspaceId, preview.candidates) : []
    const saved = await this.trials.save(
      this.trials.create({
        workspace_id: workspaceId,
        user_id: userId,
        rule_id: row.id,
        rule_name: name,
        signal: subject.signal,
        target,
        outcome: preview.readable ? 'ok' : 'failed',
        situations_read: preview.readable ? preview.candidates.length : null,
        situation_labels: labels,
        would_act: preview.readable ? preview.plan.filter(step => step.type === 'act').length : null,
        reason: preview.readable
          ? null
          : 'La source de cette règle n’a pas pu être lue : connecte-la, puis relance l’essai.',
      }),
    )
    if (preview.readable && row.draft) {
      row.draft_tested_at = now
      await this.rules.save(row)
    }
    return toTrialView(saved)
  }

  /**
   * #2399.7 — la COMPARAISON rendue avant la bascule : la version qui tourne et la suivante par leur numéro, ce qui change
   * champ par champ, ce qu'il advient de ce qui est déjà en cours, et l'impact. Tout est LU : le brouillon passe par le même
   * plan que le matin (`runner.preview`), rien ne s'exécute et rien n'est consigné au journal des essais. Une source
   * illisible se NOMME (jamais « 0 ») et n'empêche pas la bascule. Rendre la comparaison la marque rendue : la bascule l'exige.
   */
  async switchPreview(
    workspaceId: string,
    userId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<AutomationSwitchPreviewView> {
    const row = await this.own(workspaceId, userId, id)
    const { draft } = row
    if (!draft) throw new BadRequestException('Cette règle n’a pas de brouillon à comparer.')
    const current = phraseOf(row)
    const next: AutomationVersionPhrase = { ...draft, name: draft.name ?? row.name }
    const impact = await this.impactOf(asDraftSubject(row, draft), now)
    const engaged = await this.firings.count({ where: { rule_id: row.id } })
    row.draft_compared_at = now
    await this.rules.save(row)
    return {
      rule_id: row.id,
      from_version: row.version,
      to_version: row.version + 1,
      current,
      next,
      differences: diffAutomationVersions(current, draft),
      migration: { engaged_firings: engaged, signal_changes: draft.signal !== row.signal },
      impact,
    }
  }

  private async impactOf(subject: AutomationRuleEntity, now: Date): Promise<AutomationSwitchImpact> {
    const unreadable = {
      measured: false,
      reason: 'La source de cette règle n’a pas pu être lue : l’impact n’est pas mesuré, la bascule reste possible.',
    } as const
    try {
      const preview = await this.runner.preview(subject, now)
      if (!preview.readable) return unreadable
      return {
        measured: true,
        situations_read: preview.candidates.length,
        would_act: preview.plan.filter(step => step.type === 'act').length,
      }
    } catch {
      return unreadable
    }
  }

  /**
   * Le brouillon testé ET comparé devient la version suivante ; la précédente cesse de tourner mais est CONSERVÉE dans
   * `version_history` (on archive, on ne supprime pas), et rien n'est supprimé du journal.
   */
  async activateDraft(
    workspaceId: string,
    userId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<AutomationRuleView> {
    const row = await this.own(workspaceId, userId, id)
    if (!row.draft) throw new BadRequestException('Cette règle n’a pas de brouillon à activer.')
    if (!row.draft_tested_at) {
      throw new BadRequestException('Teste le parcours pour pouvoir activer : un brouillon non testé ne s’active pas.')
    }
    if (!row.draft_compared_at) {
      throw new BadRequestException(
        'Regarde la comparaison avant de basculer : la version suivante ne s’active qu’après avoir vu ce qui change.',
      )
    }
    const { draft } = row
    const kept: AutomationRuleVersionSnapshot = {
      ...phraseOf(row),
      version: row.version,
      replaced_at: now.toISOString(),
    }
    row.version_history = [...(row.version_history ?? []), kept]
    row.name = draft.name ?? row.name
    row.signal = draft.signal
    row.action_kind = draft.action_kind
    row.playbook_key = draft.playbook_key ?? null
    row.prepared_action = draft.prepared_action ?? null
    row.inactive_days = draft.inactive_days ?? null
    row.credit_cap = draft.credit_cap ?? null
    row.version += 1
    row.draft = null
    row.draft_tested_at = null
    row.draft_compared_at = null
    await this.rules.save(row)
    return this.rulesService.viewOf(workspaceId, userId, id)
  }

  /** Une copie naît ÉTEINTE, en version 1, sans brouillon ni historique : elle ne tourne qu'au premier geste humain. */
  async duplicate(workspaceId: string, userId: string, id: string): Promise<AutomationRuleView> {
    const row = await this.own(workspaceId, userId, id)
    const copy = await this.rules.save(
      this.rules.create({
        workspace_id: workspaceId,
        user_id: userId,
        signal: row.signal,
        action_kind: row.action_kind,
        playbook_key: row.playbook_key,
        prepared_action: row.prepared_action,
        inactive_days: row.inactive_days,
        credit_cap: row.credit_cap,
        template_key: row.template_key,
        name: `${row.name ?? ''} (copie)`.trim(),
        version: 1,
        draft: null,
        draft_tested_at: null,
        enabled: false,
        last_run_at: null,
        archived_at: null,
      }),
    )
    return this.rulesService.viewOf(workspaceId, userId, copy.id)
  }

  /** On archive, on ne supprime pas : la règle s'éteint et sort de la liste ; ses tâches, brouillons et preuves restent. */
  async archive(workspaceId: string, userId: string, id: string, now: Date = new Date()): Promise<void> {
    const row = await this.own(workspaceId, userId, id)
    row.enabled = false
    row.archived_at = now
    await this.rules.save(row)
  }

  async listTrials(workspaceId: string, userId: string): Promise<AutomationTrialView[]> {
    const rows = await this.trials.find({
      where: { workspace_id: workspaceId, user_id: userId },
      order: { created_at: 'DESC' },
      take: TRIALS_LIMIT,
    })
    return rows.map(toTrialView)
  }

  private async labelsOf(workspaceId: string, candidates: readonly { accountId: string | null }[]): Promise<string[]> {
    const ids = [...new Set(candidates.flatMap(candidate => (candidate.accountId ? [candidate.accountId] : [])))]
    if (ids.length === 0) return []
    const found = await this.accounts.find({ where: { id: In(ids), workspace_id: workspaceId } })
    return ids.flatMap(accountId => {
      const name = found.find(account => account.id === accountId)?.company_name
      return name ? [name] : []
    })
  }
}

/** La phrase de la règle qui tourne, telle qu'on la compare. */
function phraseOf(row: AutomationRuleEntity): AutomationVersionPhrase {
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

/** La règle telle que le brouillon la ferait tourner : l'objet que lisent l'essai et la comparaison. */
function asDraftSubject(row: AutomationRuleEntity, draft: SaveAutomationRuleDraftRequest): AutomationRuleEntity {
  return Object.assign(Object.create(Object.getPrototypeOf(row)) as AutomationRuleEntity, row, {
    signal: draft.signal,
    action_kind: draft.action_kind,
    playbook_key: draft.playbook_key ?? null,
    prepared_action: draft.prepared_action ?? null,
    inactive_days: draft.inactive_days ?? null,
    credit_cap: draft.credit_cap ?? null,
  })
}

function toTrialView(row: AutomationRuleTrialEntity): AutomationTrialView {
  return {
    id: row.id,
    rule_id: row.rule_id,
    rule_name: row.rule_name,
    signal: row.signal,
    target: row.target,
    outcome: row.outcome,
    situations_read: row.situations_read,
    situation_labels: row.situation_labels ?? [],
    would_act: row.would_act,
    reason: row.reason,
    created_at: row.created_at.toISOString(),
  }
}

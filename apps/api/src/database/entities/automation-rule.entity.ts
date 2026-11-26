import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  AutomationActionKind,
  AutomationRuleVersionSnapshot,
  SaveAutomationRuleDraftRequest,
  AutomationPreparedAction,
  AutomationSignal,
  OutreachPlaybookKey,
} from '@bellum/contracts'

/**
 * Lot L-D1 (#4167) — une règle d'automatisation : « quand [signal] → alors
 * [inscrire dans la séquence X | préparer l'action Y] ». Table `automation_rules`.
 *
 * PERSONNELLE (`user_id` : le commercial dont les contacts sont inscrits, et qui
 * reçoit les préparations dans « À traiter ») et scopée à l'espace. Une règle
 * naît ÉTEINTE d'un geste humain ; rien ne tourne sans interrupteur.
 */
@Entity({ name: 'automation_rules' })
@Index('idx_automation_rules_workspace', ['workspace_id', 'user_id'])
export class AutomationRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  user_id: string

  /** `AUTOMATION_SIGNALS` — contrainte `automation_rules_signal_check`. */
  @Column('text')
  signal: AutomationSignal

  /** `AUTOMATION_ACTION_KINDS` — contrainte `automation_rules_action_kind_check`. */
  @Column('text')
  action_kind: AutomationActionKind

  @Column('text', { nullable: true })
  playbook_key: OutreachPlaybookKey | null

  @Column('text', { nullable: true })
  prepared_action: AutomationPreparedAction | null

  /** Le seul réglage d'une source : le nombre de jours d'inactivité (7 à 365). */
  @Column('integer', { nullable: true })
  inactive_days: number | null

  @Column('boolean', { default: false })
  enabled: boolean

  /** Plafond de crédits sur 30 jours ; `null` = aucun. */
  @Column('integer', { nullable: true })
  credit_cap: number | null

  @Column('text', { nullable: true })
  template_key: string | null

  /** Le dernier passage de la préparation du matin ; `null` = jamais tourné (donc « non mesuré »). */
  @Column('timestamptz', { nullable: true })
  last_run_at: Date | null

  /** Théo C automations-editeur — le nom donné à la règle ; `null` = jamais nommée. */
  @Column('text', { nullable: true })
  name: string | null

  /** La version qui tourne : 1 à la création, +1 à chaque brouillon activé. */
  @Column('integer', { default: 1 })
  version: number

  /** La phrase en attente de test : la règle qui tourne n'est jamais modifiée tant qu'elle n'est pas activée. */
  @Column('jsonb', { nullable: true })
  draft: SaveAutomationRuleDraftRequest | null

  /** Le dernier essai RÉUSSI du brouillon ; remis à `null` à chaque enregistrement du brouillon. */
  @Column('timestamptz', { nullable: true })
  draft_tested_at: Date | null

  /**
   * #2399.7 — le moment où la COMPARAISON a été rendue pour le brouillon courant ; remis à `null` à chaque
   * enregistrement du brouillon. La bascule exige qu'elle ait été rendue (on ne bascule pas sur ce qu'on n'a pas vu).
   */
  @Column('timestamptz', { nullable: true })
  draft_compared_at: Date | null

  /**
   * #2399.7 — les versions qui ont tourné avant celle-ci, de la plus ancienne à la plus récente : l'ancienne version est
   * CONSERVÉE à chaque bascule (comparable), jamais écrasée par l'incrément.
   */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  version_history: AutomationRuleVersionSnapshot[]

  /** On archive, on ne supprime pas : une règle archivée ne tourne plus et sort de la liste. */
  @Column('timestamptz', { nullable: true })
  archived_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

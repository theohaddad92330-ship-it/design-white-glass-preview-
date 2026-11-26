import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { AutomationSignal, AutomationTrialOutcome, AutomationTrialTarget } from '@bellum/contracts'

/**
 * Théo C automations-bibliotheque.N3 — le JOURNAL DES ESSAIS : un essai lit les vraies données de l'espace et ne crée
 * ni tâche ni message. Table `automation_rule_trials`. « Un essai n'est jamais une preuve d'envoi réel » : aucune de ces
 * lignes ne dit qu'un message est parti.
 */
@Entity({ name: 'automation_rule_trials' })
@Index('idx_automation_rule_trials_owner', ['workspace_id', 'user_id', 'created_at'])
export class AutomationRuleTrialEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  user_id: string

  /** Sans clé étrangère : l'essai survit à la règle. */
  @Column('uuid', { nullable: true })
  rule_id: string | null

  @Column('text')
  rule_name: string

  /** `AUTOMATION_SIGNALS` — contrainte `automation_rule_trials_signal_check`. */
  @Column('text')
  signal: AutomationSignal

  /** `AUTOMATION_TRIAL_TARGETS` — contrainte `automation_rule_trials_target_check`. */
  @Column('text')
  target: AutomationTrialTarget

  /** `AUTOMATION_TRIAL_OUTCOMES` — contrainte `automation_rule_trials_outcome_check`. */
  @Column('text')
  outcome: AutomationTrialOutcome

  @Column('integer', { nullable: true })
  situations_read: number | null

  @Column('text', { array: true, default: () => "'{}'" })
  situation_labels: string[]

  @Column('integer', { nullable: true })
  would_act: number | null

  @Column('text', { nullable: true })
  reason: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

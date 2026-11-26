import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { AutomationOutcome, AutomationSignal } from '@bellum/contracts'

/**
 * Lot L-D1 (#4167) — le journal d'une règle : ce qu'elle a fait pour CHAQUE
 * signal. Table `automation_rule_firings`. Le compteur « 30 jours » de l'écran
 * est un comptage de ces lignes ; `(rule_id, signal_ref)` est unique, donc le
 * même signal ne déclenche jamais deux fois la même règle.
 */
@Entity({ name: 'automation_rule_firings' })
@Index('automation_rule_firings_rule_signal_uidx', ['rule_id', 'signal_ref'], { unique: true })
@Index('idx_automation_rule_firings_workspace', ['workspace_id', 'fired_at'])
export class AutomationRuleFiringEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  rule_id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  user_id: string

  @Column('text')
  signal: AutomationSignal

  /** `<kind>:<sujet>:<jour>` — l'identité d'un signal pour CETTE règle. */
  @Column('text')
  signal_ref: string

  @Column('uuid', { nullable: true })
  contact_id: string | null

  @Column('uuid', { nullable: true })
  account_id: string | null

  /** `AUTOMATION_OUTCOMES` — contrainte `automation_rule_firings_outcome_check`. */
  @Column('text')
  outcome: AutomationOutcome

  /** Pourquoi la règle n'a pas agi (exclusion nommée, contact introuvable, échec) ; `null` quand elle a agi. */
  @Column('text', { nullable: true })
  reason: string | null

  @Column('uuid', { nullable: true })
  sequence_id: string | null

  @Column('uuid', { nullable: true })
  message_id: string | null

  @Column('integer', { default: 0 })
  credits_spent: number

  @Column('timestamptz', { default: () => 'now()' })
  fired_at: Date
}

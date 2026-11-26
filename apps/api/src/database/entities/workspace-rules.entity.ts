import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import type { BusinessUnitAccountsVisibility, WorkspaceExportPolicy } from '@bellum/contracts'

/**
 * #2081.14 — les règles d'espace, posées par un administrateur, qui priment sur
 * les réglages individuels (DÉCISION Louis 19/09/2026).
 *
 * UNE ligne par espace, créée au premier changement ; aucune ligne = les
 * valeurs par défaut (`WORKSPACE_RULE_DEFAULTS`), qui sont le comportement
 * d'avant. La lecture passe par `resolveWorkspaceRuleValues` (contrat) — une
 * seule dérivation (GA-26). Migration `1789808789203-WorkspaceRules`.
 */
@Entity({ name: 'workspace_rules' })
export class WorkspaceRulesEntity {
  @PrimaryColumn('uuid')
  workspace_id: string

  @Column('text', { default: 'shared' })
  business_unit_accounts_visibility: BusinessUnitAccountsVisibility

  /** Qui l'a changée en dernier. `null` = jamais changée (valeur par défaut). */
  @Column('uuid', { nullable: true })
  business_unit_accounts_visibility_changed_by: string | null

  @Column('timestamptz', { nullable: true })
  business_unit_accounts_visibility_changed_at: Date | null

  @Column('text', { default: 'everyone' })
  export_policy: WorkspaceExportPolicy

  @Column('uuid', { nullable: true })
  export_policy_changed_by: string | null

  @Column('timestamptz', { nullable: true })
  export_policy_changed_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

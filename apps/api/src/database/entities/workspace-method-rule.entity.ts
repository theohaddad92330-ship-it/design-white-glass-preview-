import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #3295 — une règle PROMUE d'une proposition d'apprentissage ADOPTÉE
 * (`lost_deal_rule_proposals`). Naît TOUJOURS `enabled = false` : l'adoption
 * est la décision humaine, l'activation en est une seconde, séparée.
 *
 * Même gouvernance que `MethodRuleGovernance` (`owner`, `enabled`,
 * `disabled_reason`, obligatoire dès que `enabled` est faux — contrainte
 * `workspace_method_rules_disabled_reason_check`). Une proposition ne se
 * promeut qu'une fois (index unique sur `proposal_id`).
 */
@Entity('workspace_method_rules')
@Index(['workspace_id'])
export class WorkspaceMethodRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  proposal_id: string

  @Column('text')
  domain: string

  @Column('text')
  statement: string

  @Column('uuid', { nullable: true })
  owner: string | null

  @Column('boolean', { default: false })
  enabled: boolean

  @Column('text', { nullable: true })
  disabled_reason: string | null

  @Column('uuid', { nullable: true })
  activated_by: string | null

  @Column('timestamptz', { nullable: true })
  activated_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  promoted_at: Date
}

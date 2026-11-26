import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * BEL-SC-243 — apprentissage contrôlé (#3272.5) : la proposition de règle
 * née de PLUSIEURS REX de perte convergents, jamais d'un seul (contrainte
 * `lost_deal_rule_proposals_convergence_check`, base ET schéma).
 *
 * `status` naît toujours `'pending'` : seule une décision humaine explicite
 * (`POST .../decide`) la fait bouger, jamais la création.
 */
@Entity('lost_deal_rule_proposals')
@Index(['workspace_id'])
export class LostDealRuleProposalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  domain: string

  @Column('uuid', { array: true })
  convergent_rex_ids: string[]

  @Column('text')
  observation: string

  @Column('text', { default: 'pending' })
  status: string

  @Column('uuid', { nullable: true })
  proposed_by: string | null

  @Column('uuid', { nullable: true })
  decided_by: string | null

  @Column('timestamptz', { nullable: true })
  decided_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

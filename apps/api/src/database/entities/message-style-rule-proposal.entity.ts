import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { MessageStyleRuleProposalStatus, StyleLearningSignal } from '@bellum/contracts'

/**
 * #2369.7/.8 — une réécriture PROPOSE, elle ne durcit jamais seule une règle
 * durable : née `pending`, elle n'atteint `adopted`/`rejected` que par une
 * décision humaine explicite (`MessageStyleService.decideRuleProposal`).
 *
 * `observation` est une phrase courte décrivant le choix observé — jamais le
 * corps intégral d'un message (voir `message-style-rule-proposal.ts`, note de
 * tête).
 */
@Entity({ name: 'message_style_rule_proposals' })
export class MessageStyleRuleProposalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  /** Qui a proposé cette règle. */
  @Column('uuid')
  user_id: string

  @Column('uuid', { nullable: true })
  template_id: string | null

  @Column('text')
  signal: StyleLearningSignal

  @Column('text')
  observation: string

  @Column('text', { default: 'pending' })
  status: MessageStyleRuleProposalStatus

  @Column('uuid', { nullable: true })
  decided_by: string | null

  @Column('timestamptz', { nullable: true })
  decided_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

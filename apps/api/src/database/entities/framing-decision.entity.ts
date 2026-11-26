import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm'
import type { FramingDecision, FramingOrientationId } from '@bellum/contracts'

/**
 * Théo O onboarding-relecture.N1 — la décision prise sur UNE orientation du
 * cadrage (retenir · plus tard · ne pas retenir), une ligne par personne et par
 * orientation. Redécider remplace : on garde la dernière décision, pas un
 * journal. API-owned (pas de policy RLS, comme `user_onboarding_transitions`).
 */
@Entity({ name: 'framing_decisions' })
@Unique('framing_decisions_user_strategy_key', ['user_id', 'strategy_key'])
@Index('framing_decisions_user_idx', ['user_id'])
export class FramingDecisionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  @Column('text')
  strategy_key: FramingOrientationId

  @Column('text')
  decision: FramingDecision

  @Column({ type: 'timestamptz' })
  decided_at: Date
}

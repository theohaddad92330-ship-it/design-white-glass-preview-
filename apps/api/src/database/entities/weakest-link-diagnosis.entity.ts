import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { BottleneckConfidence, NotEvaluableBottleneckFamily, WeakestLinkBottleneck } from '@bellum/contracts'

/**
 * BEL-SC-224 (#3253, P0) — une ligne par diagnostic calculé (jamais un UPDATE
 * en place, voir la migration `1796373104813-WeakestLinkDiagnoses`).
 */
@Entity({ name: 'weakest_link_diagnoses' })
@Index('weakest_link_diagnoses_workspace_computed_idx', ['workspace_id', 'computed_at'])
export class WeakestLinkDiagnosisEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('timestamptz')
  computed_at: Date

  @Column('jsonb', { nullable: true })
  primary_bottleneck: WeakestLinkBottleneck | null

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  secondary_bottlenecks: WeakestLinkBottleneck[]

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  not_evaluable_families: NotEvaluableBottleneckFamily[]

  @Column('text')
  confidence: BottleneckConfidence

  @Column('text', { nullable: true })
  change_explanation: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

import type { AnalysisBatchCandidate, AnalysisBatchItemState } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * #2293.5 / .6 — un sous-job du lot : UNE entreprise. Une fois lancé, il
 * référence l'analyse unitaire ordinaire (`account_id`) dont il LIT l'état.
 */
@Entity({ name: 'analysis_batch_items' })
export class AnalysisBatchItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  batch_id: string

  @Column('uuid')
  workspace_id: string

  @Column('integer')
  position: number

  /** La saisie de l'utilisateur — pas une copie de la fiche. */
  @Column('text')
  name: string

  @Column('text', { nullable: true })
  siren: string | null

  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('text')
  state: AnalysisBatchItemState

  /** Entités proposées quand le nom seul est ambigu (`to_confirm`). */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  candidates: AnalysisBatchCandidate[]

  @Column('text', { nullable: true })
  failure_code: string | null

  /** Vrai seulement si CE sous-job a lancé une analyse neuve, donc débitée. */
  @Column('boolean', { default: false })
  charged: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

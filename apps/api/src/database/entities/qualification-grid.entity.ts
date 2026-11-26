import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { QualificationCriterionEvaluation, QualificationCriterionKind } from '@bellum/contracts'

/**
 * #3755 — une VERSION de la grille de qualification d'un espace. Modifier la
 * grille crée une nouvelle version ; l'ancienne reste, `active = false`.
 *
 * Migration : `1796435218742-QualificationGrids`.
 */
@Entity({ name: 'qualification_grids' })
@Index(['workspace_id', 'version'], { unique: true })
export class QualificationGridEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('integer')
  version: number

  @Column('boolean', { default: true })
  active: boolean

  @Column('uuid', { nullable: true })
  created_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

/** #3755 — un critère d'une version de grille (éliminatoire ou pondéré). */
@Entity({ name: 'qualification_criteria' })
@Index(['grid_id', 'code'], { unique: true })
export class QualificationCriterionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  grid_id: string

  @Column('text')
  code: string

  @Column('text')
  label: string

  @Column('text')
  kind: QualificationCriterionKind

  /** `numeric` revient en chaîne du pilote pg — convertie à la lecture. */
  @Column('numeric', { nullable: true })
  weight: string | null

  @Column('text', { nullable: true })
  description_max: string | null

  @Column('text', { nullable: true })
  description_zero: string | null

  @Column('text', { nullable: true })
  category: string | null

  @Column('integer', { default: 0 })
  position: number
}

/**
 * #3755 — l'évaluation d'un compte contre UNE version de grille : ce que
 * l'analyse a évalué, et ce que le commercial a saisi (qui gagne toujours).
 */
@Entity({ name: 'account_qualifications' })
@Index(['account_id', 'grid_id'], { unique: true })
export class AccountQualificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  account_id: string

  @Column('uuid')
  grid_id: string

  @Column('integer')
  grid_version: number

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  analysis_evaluations: QualificationCriterionEvaluation[]

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  manual_evaluations: QualificationCriterionEvaluation[]

  @Column('timestamptz', { nullable: true })
  evaluated_at: Date | null

  @Column('uuid', { nullable: true })
  updated_by: string | null

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

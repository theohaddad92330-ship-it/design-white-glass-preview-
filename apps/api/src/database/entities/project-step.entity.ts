import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ProjectStepStatus } from '@bellum/contracts'

/**
 * Une « prochaine étape » d'une opportunité, COCHABLE — distincte de
 * `ProjectRow.next_action` (dérivation non persistée). Voir la migration
 * `1796321264606-ProjectSteps` pour la raison complète ; même mécanisme que
 * `NeedStepEntity` (`need-step.entity.ts`), porté par l'opportunité.
 */
@Entity({ name: 'project_steps' })
@Index(['workspace_id', 'project_id'])
export class ProjectStepEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Index()
  @Column('uuid')
  project_id: string

  @Column('text')
  label: string

  @Column('text', { default: 'todo' })
  status: ProjectStepStatus

  @Column('integer', { default: 0 })
  position: number

  /** Quand l'étape a été cochée. `null` tant qu'elle ne l'est pas — jamais une
   *  date inventée pour une étape qui n'est pas terminée. */
  @Column('timestamptz', { nullable: true })
  done_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

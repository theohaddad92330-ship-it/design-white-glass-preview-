import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { NeedStepStatus } from '@bellum/contracts'

/**
 * Une « prochaine étape » d'un besoin, COCHABLE — distincte de `needNextAction`
 * (dérivation non persistée, `need-next-action.ts`). Voir la migration
 * `1790974000002-NeedSteps` pour la raison complète.
 */
@Entity({ name: 'need_steps' })
@Index(['workspace_id', 'need_id'])
export class NeedStepEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Index()
  @Column('uuid')
  need_id: string

  @Column('text')
  label: string

  @Column('text', { default: 'todo' })
  status: NeedStepStatus

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

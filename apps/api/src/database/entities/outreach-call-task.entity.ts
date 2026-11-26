import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { OutreachCallTaskStatus, OutreachSurface } from '@bellum/contracts'

/** #2366.5 — CALL_TASK : un appel à réaliser, sa propre machine à douze états. */
@Entity({ name: 'outreach_call_tasks' })
export class OutreachCallTaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid')
  user_id: string

  @Index()
  @Column('uuid')
  contact_id: string

  @Column('text')
  source: OutreachSurface

  @Column('text')
  reason: string

  @Column('text')
  objective: string

  @Column('text', { nullable: true })
  pitch: string | null

  @Column('text', { nullable: true })
  expected_outcome: string | null

  @Column('text', { default: 'proposed' })
  status: OutreachCallTaskStatus

  @Column('timestamptz', { nullable: true })
  scheduled_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

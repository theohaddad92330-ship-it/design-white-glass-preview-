import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/** #4739 — un angle d'approche écrit à la main, personnel à son créateur (≠ `attack_angles`, calculés). */
@Entity({ name: 'user_angles' })
export class UserAngleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  user_id: string

  /** Attribution seule : la lecture est bornée par `user_id`, l'angle suit son auteur. */
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('text')
  title: string

  @Column('text')
  content: string

  @Column('text', { default: 'human' })
  source: 'human'

  /** On archive, on ne supprime pas. */
  @Column('timestamptz', { nullable: true })
  archived_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

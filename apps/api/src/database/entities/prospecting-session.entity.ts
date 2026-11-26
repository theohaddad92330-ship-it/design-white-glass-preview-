import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2386.9 — les faits de télémétrie d'UNE session de prospection.
 *
 * AUCUN `user_id` (voir la migration `1796322780300`) : l'agrégat se lit PAR
 * `journey`, jamais par personne (GA-240/241/264/266/267).
 */
@Entity({ name: 'prospecting_sessions' })
export class ProspectingSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Index()
  @Column('text')
  journey: string

  @CreateDateColumn({ type: 'timestamptz' })
  started_at: Date

  @Column('timestamptz', { nullable: true })
  first_message_at: Date | null

  @Column('int', { default: 0 })
  messages_total: number

  @Column('int', { default: 0 })
  messages_modified: number

  @Column('int', { default: 0 })
  connector_attempts: number

  @Column('int', { default: 0 })
  connector_successes: number

  @Column('int', { default: 0 })
  duplicates_avoided: number

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

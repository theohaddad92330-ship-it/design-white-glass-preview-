import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { TalentPreparedMessageChannel } from '@bellum/contracts'

/**
 * #2185.51 — un brouillon de message pour un talent. Jamais envoyé : aucune
 * colonne de statut d'envoi ici, volontairement (« Fait » ne porte jamais de
 * preuve d'envoi qu'il n'a pas — c67).
 */
@Entity({ name: 'talent_prepared_messages' })
@Index(['consultant_id', 'created_at'])
export class TalentPreparedMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  consultant_id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('text')
  channel: TalentPreparedMessageChannel

  @Column('text', { nullable: true })
  subject: string | null

  @Column('text')
  body: string

  @Column('uuid', { nullable: true })
  prepared_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

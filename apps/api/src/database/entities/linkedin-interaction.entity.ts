import type { LinkedInInteractionKind } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Une interaction LinkedIn déclarée par le commercial.
 *
 * Aucune contrainte d'unicité : c'est un JOURNAL. Deux messages envoyés le même
 * jour à la même personne sont deux faits, pas un doublon.
 */
@Entity({ name: 'linkedin_interactions' })
export class LinkedInInteractionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  user_id: string

  @Index()
  @Column('uuid')
  contact_id: string

  @Column('text')
  kind: LinkedInInteractionKind

  @Column('timestamptz', { default: () => 'now()' })
  occurred_at: Date

  @Column('text', { nullable: true })
  note: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

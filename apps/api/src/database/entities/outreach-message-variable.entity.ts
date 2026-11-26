import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { OutreachVariableConfidence, OutreachVariableExternalUse } from '@bellum/contracts'

/**
 * #3419.1 — une variable d'une VERSION de message : sa valeur, sa source, sa
 * date, sa confiance et son autorisation d'usage externe. Annotation DÉCLARÉE
 * par le relecteur ; voir la migration `1796430140701`.
 */
@Entity({ name: 'outreach_message_variables' })
@Index(['message_id', 'version'])
export class OutreachMessageVariableEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  message_id: string

  @Column('integer')
  version: number

  @Column('text')
  name: string

  @Column('text')
  value: string

  @Column('text')
  source: string

  @Column('date')
  as_of: string

  @Column('text')
  confidence: OutreachVariableConfidence

  @Column('text')
  external_use: OutreachVariableExternalUse

  @Column('uuid')
  declared_by: string

  @CreateDateColumn({ type: 'timestamptz' })
  declared_at: Date
}

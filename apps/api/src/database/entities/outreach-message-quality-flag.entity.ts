import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { OutreachQualityFlagKind } from '@bellum/contracts'

/**
 * #2877 (#2385.4) — un signal qualité DÉCLARÉ sur un message : le relecteur
 * dit « faux fait », « CTA incorrect » ou « persona incorrect ». Jamais une
 * lecture du corps (doctrine). Voir la migration `1796413207153`.
 */
@Entity({ name: 'outreach_message_quality_flags' })
@Index(['workspace_id', 'kind'])
export class OutreachMessageQualityFlagEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  message_id: string

  @Column('uuid')
  flagged_by: string

  @Column('text')
  kind: OutreachQualityFlagKind

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

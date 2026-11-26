import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm'

/** #4427.1 — la clé Lemlist d'un espace de travail (migration 1796570106283). */
@Entity({ name: 'lemlist_connections' })
@Unique('lemlist_connections_workspace', ['workspace_id'])
export class LemlistConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  created_by: string

  /** Chiffré AES-256-GCM (même crypto que les jetons CRM). Jamais relu par une route. */
  @Column('text')
  credentials_enc: string

  @Column('timestamptz', { nullable: true })
  last_used_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

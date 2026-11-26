import type { AdminDocsProvider } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm'

/** Un outil administratif branché sur un espace (signature ou facturation). */
@Entity({ name: 'admin_docs_connections' })
@Unique('admin_docs_connections_unique', ['workspace_id', 'provider'])
export class AdminDocsConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  created_by: string

  @Column('text')
  provider: AdminDocsProvider

  /** Chiffré AES-256-GCM. Jamais relu par une route. */
  @Column('text')
  credentials_enc: string

  /** Surcharge d'URL — le contrat de certains fournisseurs n'est pas public. */
  @Column('text', { nullable: true })
  base_url: string | null

  @Column('timestamptz', { nullable: true })
  last_used_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

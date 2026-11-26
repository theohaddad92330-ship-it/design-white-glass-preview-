import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { ContextPackOriginalStatus, ContextPackRecordRequest } from '@bellum/contracts'

/**
 * #4422.1 — une ligne d'historique d'un import de l'assistant « Dépose tes documents » (postes cibles, grille,
 * séquences, connaissances). Raison complète : migration `1796570184640-ContextPackImports`.
 */
@Entity({ name: 'context_pack_imports' })
@Index(['workspace_id', 'created_at'])
export class ContextPackImportEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  user_id: string

  @Column('text')
  file_name: string

  @Column('text')
  destination: ContextPackRecordRequest['destination']

  @Column('text')
  status: ContextPackRecordRequest['status']

  /** `null` = l'importeur ne compte pas ce qu'il a pris — jamais un 0 inventé. */
  @Column('integer', { nullable: true })
  imported: number | null

  @Column('integer', { default: 0 })
  skipped: number

  @Column('integer', { nullable: true })
  scripts: number | null

  @Column('text', { nullable: true })
  message: string | null

  /** #4573 — l'état de l'ORIGINAL déposé ; `null` = import antérieur, qui n'a pas gardé son original. */
  @Column('text', { nullable: true })
  original_status: ContextPackOriginalStatus | null

  /** #4573 — `<workspace_id>/context-pack/<id>/<nom>` dans le seau PRIVÉ ; jamais rendu au navigateur. */
  @Column('text', { nullable: true })
  original_storage_path: string | null

  @Column('text', { nullable: true })
  original_mime_type: string | null

  @Column('integer', { nullable: true })
  original_size_bytes: number | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

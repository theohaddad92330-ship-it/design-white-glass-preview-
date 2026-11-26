import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { BulkExportJobKind, CvBatchImportJobStatus } from '@bellum/contracts'

/**
 * UN job d'export en lot, persisté (#1952.6, épopée #2844).
 * Raison complète : migration `1796349910000-BulkExportJobs`.
 */
@Entity({ name: 'bulk_export_jobs' })
@Index(['workspace_id', 'created_at'])
export class BulkExportJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** Qui a lancé. Un AUTEUR, pas une clé de portée — `workspace_id` isole. */
  @Column('uuid')
  user_id: string

  @Column('text')
  kind: BulkExportJobKind

  @Column('text', { default: 'queued' })
  status: CvBatchImportJobStatus

  /** `null` tant que le décompte n'a pas encore tourné — jamais 0 par défaut. */
  @Column('integer', { nullable: true })
  total: number | null

  @Column('integer', { default: 0 })
  processed_count: number

  @Column('integer', { nullable: true })
  row_count: number | null

  /** Le fichier fini, borné à `BULK_EXPORT_MAX_ROWS` lignes. `null` tant que le job n'est pas `done`. */
  @Column('text', { nullable: true })
  result_csv: string | null

  @Column('text', { nullable: true })
  error: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

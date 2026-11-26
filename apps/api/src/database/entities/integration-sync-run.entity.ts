import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { SyncRunStatus, SyncSummaryLine } from '@bellum/contracts'

/**
 * Un lancement de la première synchronisation d'un connecteur (#3014, job
 * réel BullMQ depuis l'épopée #2980).
 *
 * `summary` reste `NULL` tant que `status` n'est pas TERMINAL — un tableau
 * vide se confondrait avec « terminé, rien trouvé sur aucun domaine ».
 * `error_fr`/`error_en` restent `NULL` hors `status: 'failed'`.
 *
 * `job_key` et l'index unique partiel `integration_sync_runs_active_job_idx`
 * (migration `1796321364100`) portent l'idempotence : au plus un run NON
 * TERMINAL par (espace, connecteur), en base, pas seulement dans le contrôleur.
 */
@Entity({ name: 'integration_sync_runs' })
@Index(['workspace_id', 'provider', 'started_at'])
export class IntegrationSyncRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** Qui a cliqué « Synchroniser et comprendre mes données ». */
  @Column('uuid')
  started_by: string

  @Column('text')
  provider: string

  @Column('text', { default: 'pending' })
  status: SyncRunStatus

  @Column('jsonb', { nullable: true })
  summary: SyncSummaryLine[] | null

  @Column('text', { nullable: true })
  error_fr: string | null

  @Column('text', { nullable: true })
  error_en: string | null

  @Column('timestamptz')
  started_at: Date

  @Column('timestamptz', { nullable: true })
  finished_at: Date | null

  /** Identifiant du job BullMQ — diagnostic seulement (voir le docblock de la migration). */
  @Column('text', { nullable: true })
  job_key: string | null

  /** `NULL` sauf `status = 'canceled'` — un geste utilisateur, jamais confondu avec `failed`. */
  @Column('timestamptz', { nullable: true })
  canceled_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

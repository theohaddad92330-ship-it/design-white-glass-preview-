import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { BulkMatchingItemResult } from '@bellum/contracts'
import type { CvBatchImportJobStatus } from '@bellum/contracts'

/**
 * UN job de matching massif, persisté (#1952.3, épopée #2844).
 * Raison complète : migration `1796349900000-BulkMatchingJobs`.
 */
@Entity({ name: 'bulk_matching_jobs' })
@Index(['workspace_id', 'created_at'])
export class BulkMatchingJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** Qui a lancé. Un AUTEUR, pas une clé de portée — `workspace_id` isole. */
  @Column('uuid')
  user_id: string

  /** La liste D'ENTRÉE, dans l'ordre de traitement. */
  @Column('jsonb')
  need_ids: string[]

  @Column('text', { default: 'queued' })
  status: CvBatchImportJobStatus

  @Column('integer')
  total: number

  /** Combien de besoins ont déjà produit une issue — la reprise repart d'ici. */
  @Column('integer', { default: 0 })
  processed_count: number

  /** Les issues déjà produites, dans l'ORDRE de traitement — un PRÉFIXE tant que le job n'est pas `done`/`failed`. */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  results: BulkMatchingItemResult[]

  /** La dernière erreur d'une tentative TOP-NIVEAU (crash du worker). `null` = rien n'a fait tomber le job entier. */
  @Column('text', { nullable: true })
  error: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

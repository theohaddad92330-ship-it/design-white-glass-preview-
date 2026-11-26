import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { BulkCvRewriteItemResult, CvBatchImportJobStatus } from '@bellum/contracts'

/**
 * UN job de réécriture de CV en lot, persisté (#1952.5, épopée #2844).
 * Raison complète : migration `1796376712468-BulkCvRewriteJobs`.
 */
@Entity({ name: 'bulk_cv_rewrite_jobs' })
@Index(['workspace_id', 'created_at'])
export class BulkCvRewriteJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** Qui a lancé. Un AUTEUR, pas une clé de portée — `workspace_id` isole. */
  @Column('uuid')
  user_id: string

  /** LE besoin auquel chaque CV est adapté — un seul par lot. */
  @Column('uuid')
  opportunity_id: string

  /** La liste D'ENTRÉE, dans l'ordre de traitement. */
  @Column('jsonb')
  consultant_ids: string[]

  @Column('text', { default: 'queued' })
  status: CvBatchImportJobStatus

  @Column('integer')
  total: number

  /** Combien de consultants ont déjà produit une issue — la reprise repart d'ici. */
  @Column('integer', { default: 0 })
  processed_count: number

  /** Les issues déjà produites, dans l'ORDRE de traitement — un PRÉFIXE tant que le job n'est pas `done`/`failed`. */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  results: BulkCvRewriteItemResult[]

  /** La dernière erreur d'une tentative TOP-NIVEAU (crash du worker). `null` = rien n'a fait tomber le job entier. */
  @Column('text', { nullable: true })
  error: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

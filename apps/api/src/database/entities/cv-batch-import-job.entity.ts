import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { CvBatchFileOutcome, CvBatchImportJobKind, CvBatchImportJobStatus } from '@bellum/contracts'

/**
 * UN job d'import de CV en masse, persisté (#2326.12, épopée #2794).
 * Raison complète : migration `1796322044000-CvBatchImportJobs`.
 */
@Entity({ name: 'cv_batch_import_jobs' })
@Index(['workspace_id', 'created_at'])
export class CvBatchImportJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** Qui a lancé. Un AUTEUR, pas une clé de portée — c'est `workspace_id` qui isole. */
  @Column('uuid')
  user_id: string

  @Column('text')
  kind: CvBatchImportJobKind

  @Column('text', { default: 'queued' })
  status: CvBatchImportJobStatus

  @Column('integer')
  total: number

  /** Combien d'entrées ont déjà produit une issue — la reprise repart d'ici, jamais de zéro. */
  @Column('integer', { default: 0 })
  processed_count: number

  /** Les issues déjà produites, dans l'ORDRE de traitement — un PRÉFIXE tant que le job n'est pas `done`/`failed`. */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  outcomes: CvBatchFileOutcome[]

  /** La dernière erreur d'une tentative. `null` = rien n'a échoué, pas une erreur vide. */
  @Column('text', { nullable: true })
  error: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

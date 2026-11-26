import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ExternalSourcingCandidate } from '@bellum/contracts'
import type { CvBatchImportJobStatus, MultiSourceSearchItemResult } from '@bellum/contracts'

/**
 * UN job de recherche multi-sources, persisté (#1952.7, épopée #2844).
 * Raison complète : migration `1796349920000-MultiSourceSearchJobs`.
 */
@Entity({ name: 'multi_source_search_jobs' })
@Index(['workspace_id', 'created_at'])
@Index(['need_id', 'created_at'])
export class MultiSourceSearchJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** Qui a lancé. Un AUTEUR, pas une clé de portée — `workspace_id` isole. */
  @Column('uuid')
  user_id: string

  @Column('uuid')
  need_id: string

  @Column('text', { default: 'queued' })
  status: CvBatchImportJobStatus

  /** `null` tant que les sources configurées n'ont pas encore été comptées. */
  @Column('integer', { nullable: true })
  total: number | null

  @Column('integer', { default: 0 })
  processed_count: number

  /** L'issue de CHAQUE source interrogée, dans l'ordre — un PRÉFIXE tant que le job n'est pas `done`/`failed`. */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  results: MultiSourceSearchItemResult[]

  /** Les candidats déjà classés (`rankExternalSourcingCandidates`), écrits une fois le job `done`. `null` avant. */
  @Column('jsonb', { nullable: true })
  candidates: ExternalSourcingCandidate[] | null

  @Column('text', { nullable: true })
  error: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

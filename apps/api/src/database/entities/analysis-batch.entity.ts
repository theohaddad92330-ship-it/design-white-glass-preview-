import type { AnalysisBatchSource, LauraContextMode } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * #2293.5 — le JOB PARENT d'un lot d'analyses multi-comptes. Son statut n'est
 * pas une colonne : il s'agrège de ses sous-jobs (`summarizeAnalysisBatch`).
 * Voir la migration `1796000544454-AnalysisBatches`.
 */
@Entity({ name: 'analysis_batches' })
export class AnalysisBatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** Qui a lancé le lot — c'est aussi au nom de qui chaque analyse est lancée et débitée. */
  @Column('uuid')
  created_by: string

  @Column('text')
  source: AnalysisBatchSource

  /** Le geste d'annulation, daté. `null` = jamais annulé. */
  @Column('timestamptz', { nullable: true })
  canceled_at: Date | null

  /**
   * #2922 — le mode de contexte CHOISI pour ce lot (`SurfaceContextChip`,
   * surface `analysis_batch`). `null` = aucun choix fait, chaque sous-job
   * retombe sur le défaut de l'espace (migration `AnalysisBatchContextMode`).
   * PERSISTÉ pour que `retry`/`confirm` relancent avec le MÊME mode — jamais un
   * retour silencieux à « Mon activité ».
   */
  @Column('text', { nullable: true })
  context_mode: LauraContextMode | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

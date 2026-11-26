import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  OrgEnrichmentJobStatus,
  OrgEnrichmentTargetMode,
  OrgEnrichmentTargetParams,
  OrgEnrichmentWave,
} from '@bellum/contracts'

/**
 * UN plan d'enrichissement d'organigramme, persisté (OrgGraph FINAL §11).
 * Raison complète : migration `1791008000001-OrgEnrichmentJobs`.
 */
@Entity({ name: 'org_enrichment_jobs' })
@Index(['workspace_id', 'account_id', 'mode'])
export class OrgEnrichmentJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Index()
  @Column('uuid')
  account_id: string

  /** Qui a lancé. Un AUTEUR, pas une clé de portée — c'est `workspace_id` qui isole. */
  @Column('uuid')
  user_id: string

  @Column('text')
  mode: OrgEnrichmentTargetMode

  /** Les paramètres du mode, tels que l'appelant les a demandés. */
  @Column('jsonb', { default: () => "'{}'::jsonb" })
  target_params: OrgEnrichmentTargetParams

  /** Combien de contacts par vague — FIGÉ à la création, comme les lots. */
  @Column('integer', { default: 50 })
  wave_size: number

  /** Toujours écrit depuis `deriveOrgEnrichmentJobStatus`, jamais à la main. */
  @Column('text', { default: 'pending' })
  status: OrgEnrichmentJobStatus

  @Column('text')
  prompt_version: string

  /** Ce qu'on a ANNONCÉ avant le premier clic. Ne bouge plus jamais. */
  @Column('integer', { default: 0 })
  estimated_credits: number

  /**
   * Ce qui a RÉELLEMENT été débité, en unités de crédit.
   *
   * `null` = aucune vague n'a encore abouti — il n'y a rien à mesurer. Jamais
   * `0`, qui dirait « mesuré, et ça n'a rien coûté ». Colonne DISTINCTE de
   * `estimated_credits` : c'est l'écart entre les deux qu'on veut lire.
   */
  @Column('integer', { nullable: true })
  actual_credits: number | null

  /** Les lots, figés à la création (D813) : un « reprendre » relance les vagues
   *  encore en attente sur EXACTEMENT le périmètre annoncé. */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  waves: OrgEnrichmentWave[]

  /** La dernière erreur rencontrée. `null` = rien n'a échoué, pas « erreur vide ». */
  @Column('text', { nullable: true })
  error: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

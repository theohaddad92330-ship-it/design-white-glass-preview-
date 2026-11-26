import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  WorkspaceMergeItemOutcome,
  WorkspaceMergePreview,
  WorkspaceMergeStatus,
  WorkspaceMergeTable,
} from '@bellum/contracts'

/**
 * #4158.57 (décision Louis 17/10/2026) — une demande de rapatriement de l'espace PERSONNEL d'un
 * utilisateur dans l'espace ESN qu'il a rejoint. `workspace_id` est l'espace CIBLE, celui dont un admin
 * arbitre ; `preview` est l'aperçu FIGÉ et `preview_hash` son empreinte — les deux validations portent sur
 * elle. Migration `1796560255919-WorkspacePersonalMerge`.
 */
@Entity({ name: 'workspace_merge_requests' })
@Index(['workspace_id', 'status'])
export class WorkspaceMergeRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  source_workspace_id: string

  @Column('uuid')
  requested_by: string

  @Column('text', { default: 'previewed' })
  status: WorkspaceMergeStatus

  @Column('jsonb')
  preview: WorkspaceMergePreview

  @Column('text')
  preview_hash: string

  @Column('timestamptz', { nullable: true })
  user_validated_at: Date | null

  @Column('uuid', { nullable: true })
  admin_validated_by: string | null

  @Column('timestamptz', { nullable: true })
  admin_validated_at: Date | null

  @Column('uuid', { nullable: true })
  rejected_by: string | null

  @Column('timestamptz', { nullable: true })
  rejected_at: Date | null

  @Column('timestamptz', { nullable: true })
  started_at: Date | null

  @Column('timestamptz', { nullable: true })
  finished_at: Date | null

  @Column('text', { nullable: true })
  last_error: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

/**
 * #4158.57 — le journal ligne à ligne du job de rapatriement. UNE ligne par (demande, table, ligne
 * d'origine) : rejouer le job après une coupure ne recopie rien deux fois. `target_id` = la copie écrite,
 * ou la fiche EXISTANTE de l'espace cible pour un doublon proposé (jamais écrite).
 */
@Entity({ name: 'workspace_merge_items' })
@Index(['request_id', 'source_table', 'source_id'], { unique: true })
export class WorkspaceMergeItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  request_id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  source_table: WorkspaceMergeTable

  @Column('uuid')
  source_id: string

  @Column('uuid', { nullable: true })
  target_id: string | null

  @Column('text')
  outcome: WorkspaceMergeItemOutcome

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

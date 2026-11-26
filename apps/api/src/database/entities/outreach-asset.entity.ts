import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { OutreachAssetCategory, OutreachAssetUsageRights } from '@bellum/contracts'

/**
 * Un asset du catalogue outreach — métadonnées et droits d'usage, avant tout
 * fichier rattaché ou tout gate d'envoi (#2838). Workspace-scoped, team-shared,
 * même modèle que `library_items` : lazy-seedé d'un catalogue de démarrage au
 * premier affichage (`OutreachAssetService.ensureSeeded`). Voir la migration
 * `1796001543063-OutreachAssets` pour la raison complète.
 */
@Entity({ name: 'outreach_assets' })
@Index(['workspace_id', 'created_at'])
export class OutreachAssetEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  user_id: string

  @Column('text')
  title: string

  @Column('text', { nullable: true })
  description: string | null

  @Column('text')
  category: OutreachAssetCategory

  @Column('text')
  usage_rights: OutreachAssetUsageRights

  /**
   * #3699.6 — le fichier RÉEL de l'asset (`storage_objects`, domaine
   * `outreach_asset_file`). `null` = asset annoncé, sans fichier : il ne se
   * joint pas. Migration `1796437901201-OutreachAssetFile`.
   */
  @Column('uuid', { nullable: true })
  storage_object_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

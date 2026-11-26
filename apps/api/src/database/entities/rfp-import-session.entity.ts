import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { RfpImportPreview, RfpImportSessionStatus } from '@bellum/contracts'

/**
 * #2957 (#2180.53) — un import d'appel d'offres en cours, gardé côté serveur
 * pour survivre à une interruption (migration `1796413352817`). UNE session
 * `in_progress` par personne et par espace : reprendre, c'est retrouver
 * CELLE-LÀ. `confirmed` / `cancelled` se gardent — on archive, on ne supprime
 * pas.
 *
 * Les octets des fichiers n'y sont jamais : seuls les NOMS (`document_names`).
 */
@Entity({ name: 'rfp_import_sessions' })
@Index(['workspace_id', 'user_id', 'status'])
export class RfpImportSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  user_id: string

  @Column('text', { default: 'in_progress' })
  status: RfpImportSessionStatus

  @Column('text', { default: '' })
  title: string

  @Column('text', { nullable: true })
  pasted_text: string | null

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  document_names: string[]

  @Column('jsonb', { nullable: true })
  preview: RfpImportPreview | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

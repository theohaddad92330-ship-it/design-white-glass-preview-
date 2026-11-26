import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2957 (#2180.54) — le fichier BRUT d'un document d'appel d'offres, tel que
 * déposé à l'import. Pure jointure vers `storage_objects` (le registre
 * central, voir `StorageObjectEntity`) : cette table ne connaît ni le contenu
 * ni le chemin du fichier, seulement quel dossier RFP le possède et dans
 * quel ordre (`position`, l'ordre de dépôt — voir la migration
 * `1796412761537-RfpSourceDocuments`).
 */
@Entity({ name: 'rfp_source_documents' })
@Index(['workspace_id', 'rfp_id'])
export class RfpSourceDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Index()
  @Column('uuid')
  rfp_id: string

  @Index()
  @Column('uuid')
  storage_object_id: string

  @Column('smallint', { default: 0 })
  position: number

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

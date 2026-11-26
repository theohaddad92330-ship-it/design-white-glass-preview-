import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { NeedDocumentKind, NeedDocumentStatus } from '@bellum/contracts'

/**
 * Une pièce d'une affaire — devis, NDA, contrat cadre — et son statut.
 *
 * Rattachée au BESOIN (`need_id`), pas au projet : un projet porte souvent
 * plusieurs rôles, et un devis répond à un rôle précis. Voir la migration
 * `1790974000001-NeedDocuments` pour la raison complète.
 */
@Entity({ name: 'need_documents' })
@Index(['workspace_id', 'need_id'])
export class NeedDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Index()
  @Column('uuid')
  need_id: string

  @Column('text')
  kind: NeedDocumentKind

  @Column('text')
  name: string

  @Column('text', { default: 'draft' })
  status: NeedDocumentStatus

  /**
   * Le fichier de ce document, quand il existe (31/08/2026).
   *
   * `null` = document SUIVI sans pièce jointe. C'est le cas de toutes les
   * lignes antérieures au stockage, et il reste légitime après : on peut
   * suivre l'état d'une NDA qu'on n'a pas encore reçue.
   *
   * ⚠️ `ON DELETE SET NULL` côté base : la purge de rétention emporte le
   * FICHIER, jamais la ligne — le fait qu'une NDA a été signée survit au
   * fichier qui la portait.
   */
  @Index()
  @Column('uuid', { nullable: true })
  storage_object_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

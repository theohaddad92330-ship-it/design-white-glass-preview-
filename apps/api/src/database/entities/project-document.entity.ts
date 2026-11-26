import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ProjectDocumentKind, ProjectDocumentStatus } from '@bellum/contracts'

/**
 * Une pièce d'une OPPORTUNITÉ — devis, NDA, contrat cadre — et son statut.
 *
 * Rattachée au PROJET (`project_id`), pas au besoin : voir la migration
 * `1796321404173-ProjectDocuments` (#2171.24) pour la raison complète, et
 * `need-document.entity.ts` pour l'équivalent côté besoin.
 */
@Entity({ name: 'project_documents' })
@Index(['workspace_id', 'project_id'])
export class ProjectDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Index()
  @Column('uuid')
  project_id: string

  @Column('text')
  kind: ProjectDocumentKind

  @Column('text')
  name: string

  @Column('text', { default: 'draft' })
  status: ProjectDocumentStatus

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

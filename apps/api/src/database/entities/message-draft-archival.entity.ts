import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Théo B M2.R6 — « Archiver le brouillon » : on archive, on ne supprime pas. Ligne d'audit liée à UNE version
 * (`message_draft_versions`), jamais corrigée : une version neuve sur le même fil ramène le brouillon dans « Brouillons ».
 * Elle ne porte aucun contenu et ne déclenche aucun envoi.
 */
@Entity({ name: 'message_draft_archivals' })
@Index(['workspace_id', 'archived_by', 'created_at'])
export class MessageDraftArchivalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Index({ unique: true })
  @Column('uuid')
  version_id: string

  @Column('uuid')
  archived_by: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { MissionDocumentKind, MissionDocumentStatus } from '@bellum/contracts'

/**
 * Une pièce d'une MISSION — contrat signé, avenant, NDA — et son statut.
 *
 * Rattachée à la MISSION (`mission_id`), pas à l'opportunité : voir la
 * migration `MissionDocuments` (#2193.51, épopée #2953) pour la raison
 * complète, et `project-document.entity.ts` pour l'équivalent côté opportunité.
 */
@Entity({ name: 'mission_documents' })
@Index(['workspace_id', 'mission_id'])
export class MissionDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Index()
  @Column('uuid')
  mission_id: string

  @Column('text')
  kind: MissionDocumentKind

  @Column('text')
  name: string

  @Column('text', { default: 'draft' })
  status: MissionDocumentStatus

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

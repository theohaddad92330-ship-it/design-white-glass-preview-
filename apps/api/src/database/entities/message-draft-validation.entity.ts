import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Théo B C6.N2 — la validation d'UNE version de brouillon (`message_draft_versions`). Ligne d'audit, jamais
 * corrigée : modifier le brouillon ajoute une version, donc une nouvelle relecture. Elle ne porte que
 * l'empreinte du contenu relu (jamais le corps) et ne déclenche aucun envoi.
 */
@Entity({ name: 'message_draft_validations' })
@Index(['workspace_id', 'validated_by', 'created_at'])
export class MessageDraftValidationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Index({ unique: true })
  @Column('uuid')
  version_id: string

  /** sha-256 hexadécimal du sujet + corps EFFECTIFS de la version au moment de la relecture. */
  @Column('text')
  content_hash: string

  @Column('uuid')
  validated_by: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm'
import type { ReplyBlock } from '@bellum/contracts'

/**
 * #2429.9 (épopée #2852, lot P07 30/09) — UNE version modifiée d'un artefact de
 * chat. La version 1 est le texte du message (jamais réécrit) ; cette table ne
 * porte que les versions ≥ 2. Migration `1796413214387`.
 */
@Entity({ name: 'chat_artifact_versions' })
@Unique('chat_artifact_versions_unique', ['message_id', 'block_rank', 'version'])
@Index('chat_artifact_versions_message_idx', ['message_id', 'block_rank', 'version'])
export class ChatArtifactVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  message_id: string

  /** Le rang du bloc parmi les blocs du message (`chatArtifactId(messageId, rang)`). */
  @Column('integer')
  block_rank: number

  @Column('integer')
  version: number

  @Column('jsonb')
  block: ReplyBlock

  /** L'auteur — toujours le JWT. `null` = compte effacé (RGPD), le contenu reste. */
  @Column('uuid', { nullable: true })
  edited_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

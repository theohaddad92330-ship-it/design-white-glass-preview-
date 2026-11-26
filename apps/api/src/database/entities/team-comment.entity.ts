import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Commentaire d'équipe (cockpit manager §10 — « Capitalisation & collaboration »).
 * Un fil partagé à l'échelle du workspace, optionnellement rattaché à un compte.
 * Voir la migration `1788230518044-TeamComments`.
 *
 * #1940.6 — étendu par `1795999685841-TeamCommentsConversationScope` :
 * `conversation_id`/`message_id` ciblent un fil ou une réponse précise de
 * `/chat` — `NULL` sur les deux, comportement d'avant (commentaire général).
 */
@Entity({ name: 'team_comments' })
@Index('team_comments_workspace_created_idx', ['workspace_id', 'created_at'])
@Index('team_comments_conversation_idx', ['workspace_id', 'conversation_id', 'created_at'])
export class TeamCommentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  author_user_id: string

  @Column('text')
  body: string

  /** Compte ciblé (facultatif) — `null` = commentaire général à l'équipe. */
  @Column('uuid', { nullable: true })
  account_id: string | null

  /**
   * #1940.6 — le fil ciblé (facultatif). Même type `text` que
   * `chat_messages.conversation_id` : le fil par défaut n'a pas de ligne
   * `chat_conversations`, donc pas de FK possible ici non plus.
   */
  @Column('text', { nullable: true })
  conversation_id: string | null

  /** #1940.6 — la réponse précise ciblée (facultatif) — `null` = commentaire de fil. */
  @Column('uuid', { nullable: true })
  message_id: string | null

  /**
   * #2914 (#2128.9) — les collègues mentionnés, jamais `null` : un tableau
   * vide dit « personne mentionné », vrai pour tout commentaire sans mention.
   */
  @Column('uuid', { array: true, default: '{}' })
  mentioned_user_ids: string[]

  /**
   * #4158.31 — la racine du fil à laquelle cette réponse se rattache (`null` = c'est
   * une racine). Une réponse à une réponse se rattache à la RACINE, jamais plus bas.
   */
  @Column('uuid', { nullable: true })
  parent_comment_id: string | null

  /** #4158.31 — fil résolu (sur la racine) : quand, et par qui. `null` = ouvert. */
  @Column('timestamptz', { nullable: true })
  resolved_at: Date | null

  @Column('uuid', { nullable: true })
  resolved_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

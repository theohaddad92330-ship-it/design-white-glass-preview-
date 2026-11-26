import type { EntryStrategy } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * #2075.29 / #2075.30 — la forme figée dans `chat_conversations.audit_snapshot`.
 * `auditVersion`/`unknowns` restent NULL/`[]` quand l'audit n'en portait pas
 * encore (même doctrine que `unestablished` côté écran : une absence se NOMME,
 * elle ne devient jamais une valeur inventée).
 */
type ChatConversationAuditSnapshotColumn = {
  auditVersion: number | null
  strategy: EntryStrategy | null
  firstActions: string[]
  unknowns: string[]
  takenAt: string
}

/**
 * #2430.11 — L'OBJET CONVERSATION : ce qu'un fil NOMMÉ porte au-delà de ses
 * messages (propriétaire, fil d'origine, objet rattaché, conservation légale).
 *
 * Une conversation est toujours sa clé (`chat_messages.conversation_id`) et ses
 * lignes : cette table ne les remplace pas, elle les ÉTEND. Une conversation
 * sans ligne ici se comporte exactement comme avant (#2430, migration
 * `1795999431572-ChatConversations`) — c'est `ChatConversationsService.detail`
 * qui rend ces valeurs par défaut, jamais une ligne inventée.
 *
 * Seul un fil NOMMÉ en a une : le fil par défaut est privé à son auteur
 * (#2703), il n'a ni propriétaire à transférer ni partage à figer.
 */
@Entity({ name: 'chat_conversations' })
@Index('chat_conversations_thread_unique', ['workspace_id', 'conversation_id'], { unique: true })
export class ChatConversationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** L'espace du fil. Jamais nul : c'est ce qui empêche l'objet de fuiter. */
  @Column('uuid')
  workspace_id: string

  @Column('text')
  conversation_id: string

  /** #2430.12 — propriétaire DÉCLARÉ. `null` = qui a ouvert le fil (ou compte effacé). */
  @Column('uuid', { nullable: true })
  owner_user_id: string | null

  /** #2430.2 — le fil dont celui-ci est une branche. `null` = fil d'origine. */
  @Column('text', { nullable: true })
  parent_conversation_id: string | null

  /** #2430.2 — la réponse d'où la branche repart. */
  @Column('uuid', { nullable: true })
  branched_from_message_id: string | null

  /** #2430.12 — le compte auquel la conversation est rattachée. */
  @Column('uuid', { nullable: true })
  attached_account_id: string | null

  /**
   * #2075.29 / #2075.30 — CE QUE L'AUDIT DISAIT au moment où le fil s'est ouvert
   * depuis lui : version, stratégie choisie, premiers mouvements proposés, et
   * les INCONNUES (ce qui n'a pas pu être établi). Posé UNE FOIS par
   * `attachAuditSnapshot`, jamais réécrit par une régénération ultérieure de
   * l'audit — migration `1796322040100-ChatConversationAuditSnapshot`.
   */
  @Column('jsonb', { nullable: true })
  audit_snapshot: ChatConversationAuditSnapshotColumn | null

  /** #2430.10 — conservation légale : posée, le fil ne se retire pas. */
  @Column('timestamptz', { nullable: true })
  legal_hold_at: Date | null

  @Column('uuid', { nullable: true })
  legal_hold_by: string | null

  /**
   * #2439.13 — POURQUOI cette conservation existe. Requis à la pose
   * (`chatConversationLegalHoldSchema`), migration `1796321386100-ChatConversationLegalHoldReason`.
   */
  @Column('text', { nullable: true })
  legal_hold_reason: string | null

  /**
   * #2439.13 — la date de revue, OPTIONNELLE et DÉCLARÉE par le gérant qui
   * pose la conservation (migration `1796322750100-ChatConversationLegalHoldReviewBy`).
   * `NULL` = aucun délai posé, même comportement qu'avant cette colonne.
   */
  @Column('timestamptz', { nullable: true })
  legal_hold_review_by: Date | null

  @Column('uuid', { nullable: true })
  created_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

/**
 * #2430.4 / #2430.11 — une VERSION FIGÉE d'une conversation : une BORNE sur le
 * même fil (le dernier message qu'elle montre), jamais une copie. Un lien
 * « version figée » lit le fil par le même chemin que le lien vivant, borné à
 * `up_to_at` — aucun second chemin de lecture (docblock de `ShareConversation`).
 */
@Entity({ name: 'chat_conversation_versions' })
@Index('chat_conversation_versions_unique', ['workspace_id', 'conversation_id', 'version'], { unique: true })
export class ChatConversationVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  conversation_id: string

  /** 1, 2, 3… par conversation. */
  @Column('integer')
  version: number

  @Column('uuid')
  up_to_message_id: string

  @Column('timestamptz')
  up_to_at: Date

  @Column('uuid', { nullable: true })
  created_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

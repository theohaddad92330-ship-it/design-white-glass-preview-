import type { ChatThreadTitleSource } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * #1911.1 / #1911.12 / #1955.1 — le TITRE d'un fil de Laura, et qui l'a écrit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE TABLE, ET PAS UNE COLONNE DE `chat_messages`
 * ─────────────────────────────────────────────────────────────────────────────
 * L'état d'un fil n'a pas de table : l'archivage (#1120) estampille CHAQUE
 * message (`chat_messages.archived_at`), parce qu'un fil EST sa clé et ses
 * lignes. Un titre ne se prête pas à ce motif — il se renomme, il a un auteur,
 * et le poser sur « le premier message » dépendrait de la requête qui décide
 * lequel est le premier. Il vit donc à côté, une ligne par fil et par espace.
 *
 * La clé du fil (`thread_key`) reprend EXACTEMENT la désignation de l'archivage
 * et de la suppression (`threadWhere`, `chat-messages.service.ts`) :
 * `c:<conversation_id>` quand le fil en porte un, `a:<account_id>|u:<user_id>`
 * pour le fil par défaut. Le préfixe empêche qu'une clé de conversation libre ne
 * collisionne avec un compte.
 *
 * ⚠️ #2703 (22/09/2026) — le `|u:<user_id>` est NEUF, et il suit la clé du fil :
 * le fil par défaut appartient à son auteur, donc son titre aussi — sinon deux
 * membres d'un même espace se renommeraient mutuellement leur fil personnel, et
 * un titre, DÉRIVÉ des messages, remettrait à l'écran le mélange que #2703
 * supprime. Aucune migration : `thread_key` est un `text` sans contrainte de
 * forme ni de longueur. Un titre écrit AVANT ce lot pour un fil par défaut garde
 * l'ancienne clé (`a:<account_id>`) : il n'est plus retrouvé, il n'est pas
 * supprimé, et le fil reprend son premier message pour titre — l'état exact d'un
 * fil pas encore titré.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX AUTEURS, ET L'UN GAGNE TOUJOURS
 * ─────────────────────────────────────────────────────────────────────────────
 * `title_source = 'laura'` : rédigé en tâche de fond après le 2e échange, inséré
 * SEULEMENT si aucune ligne n'existe (`ON CONFLICT DO NOTHING`).
 * `title_source = 'user'` : saisi à la main, écrase tout (`ON CONFLICT DO
 * UPDATE`). Une correction humaine gagne toujours, quelle que soit sa date.
 *
 * Migration `1792800043517-ChatThreadTitles`. Scopée par `workspace_id` comme
 * les messages qu'elle titre : les fils sont une ressource d'équipe.
 */
@Entity({ name: 'chat_thread_titles' })
@Index('chat_thread_titles_thread_unique', ['workspace_id', 'thread_key'], { unique: true })
export class ChatThreadTitleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** L'espace du fil. Jamais nul : c'est ce qui empêche un titre de fuiter. */
  @Column('uuid')
  workspace_id: string

  /** `c:<conversation_id>` ou `a:<account_id>|u:<user_id>` (#2703) — voir le docbloc. */
  @Column('text')
  thread_key: string

  @Column('text')
  title: string

  /** `laura` ou `user` — contrainte `chat_thread_titles_title_source_check`. */
  @Column('text')
  title_source: ChatThreadTitleSource

  /**
   * Qui a posé ce titre : la personne qui l'a saisi, ou celle dont le tour a
   * déclenché la rédaction par Laura. C'est aussi ce que borne le nombre de
   * titres rédigés par personne sur 24 h.
   *
   * `null` = compte supprimé (#1939, RGPD art. 17) :
   * `PrivacyDeletionService.anonymizeThreadTitles` retire ce lien, jamais le
   * titre, qui nomme un fil partagé de l'espace. Posée `NOT NULL` par
   * `1792800043517-ChatThreadTitles`, relâchée par
   * `1792800044000-ChatThreadTitleSetByNullable` (GA-129).
   */
  @Column('uuid', { nullable: true })
  set_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

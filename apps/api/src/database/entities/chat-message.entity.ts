import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { ChatBranchKind, PersistedChatContext, PersistedChatImage } from '@bellum/contracts'

export type ChatMessageRole = 'user' | 'assistant'

@Entity({ name: 'chat_messages' })
@Index('chat_messages_thread_idx', ['user_id', 'account_id', 'created_at'])
@Index('chat_messages_conversation_idx', ['user_id', 'conversation_id', 'created_at'])
export class ChatMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /**
   * L'auteur du message (le membre dont c'est le fil, y compris sur les
   * réponses de Laura — voir `ChatMessagesService.create`).
   *
   * ⚠️ #2703 (22/09/2026) — CETTE COLONNE EST DEVENUE UNE CLÉ DE LECTURE, pas
   * seulement une attribution. `ChatMessagesService.threadWhere` lit le fil PAR
   * DÉFAUT (sans `conversation_id`) par `workspace_id` **et** `user_id` : il est
   * privé à son auteur. Une conversation NOMMÉE reste partagée par l'espace et
   * se lit par `workspace_id` seul, comme avant. Aucune migration : la colonne
   * portait déjà l'auteur de chaque ligne.
   *
   * `null` = compte supprimé (#1939, RGPD art. 17) :
   * `PrivacyDeletionService.anonymizeChatMessages` retire ce lien, JAMAIS le
   * contenu. Conséquence assumée de #2703 : dans une conversation NOMMÉE, le
   * texte reste lisible par les collègues et seule l'identité disparaît ; dans
   * le fil PAR DÉFAUT — devenu privé —, une ligne sans auteur n'est plus
   * rattachée à personne, donc plus lue par personne. Elle n'est ni supprimée
   * ni modifiée (« on archive, on ne supprime pas ») : c'est le brouillon
   * personnel de quelqu'un qui a demandé son effacement.
   *
   * Posée `NOT NULL` par `1783600000000-ChatMessages`, relâchée par
   * `1792800031000-ChatMessageAuthorNullable` — AVANT le code qui écrit `null`
   * (GA-11/GA-12).
   */
  @Column('uuid', { nullable: true })
  user_id: string | null

  // Team scope (multi-user Phase 2). Nullable while the user_id → workspace_id
  // roll-out is mid-flight (see agent_docs/multi-user-workspaces.md): the Phase-1
  // migration backfilled it 1:1 from each row's owner workspace, and it flips to
  // NOT NULL only once every write path stamps it. `user_id` stays as the
  // created-by attribution; `workspace_id` becomes the read scope.
  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('uuid', { nullable: true })
  conversation_id: string | null

  @Column('text')
  role: ChatMessageRole

  @Column('text')
  content: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  /**
   * Quand ce message a été RANGÉ avec son fil (#1120), ou `null`.
   *
   * L'estampille porte sur le message parce qu'il n'existe pas de table de
   * fils : un fil est une clé (`COALESCE(conversation_id, id::text)`) et ses
   * messages sont ses seules lignes. Migration `1790113847215`. `null` = fil
   * actif, l'état de tout l'existant.
   */
  @Column('timestamptz', { nullable: true })
  archived_at: Date | null

  /**
   * Laura a répondu à CE message (de l'utilisateur) par une question de
   * précision, et voici quand. `null` = elle n'a rien demandé.
   *
   * Marquage à la SOURCE : posé par l'API à la fin de `POST /ia/chat`, quand
   * l'enveloppe du service IA porte `context.clarification` — c'est-à-dire
   * quand le modèle a appelé `ask_clarification`. C'est le seul endroit du
   * produit où « Laura demande » est un fait machine ; relire le texte de la
   * réponse à la recherche d'un point d'interrogation exonérerait aussi ses
   * propositions (« Tu veux analyser quelques comptes ? »).
   */
  @Column('timestamptz', { nullable: true })
  precision_request_at: Date | null

  /**
   * CE message répondait à une question de précision de Laura : le plafond
   * quotidien ne le compte pas. `null` = il compte, ce qui est le cas par
   * défaut et celui de tout l'existant.
   *
   * Écrit par l'API seule, jamais par le client — la décision est prise dans
   * `ChatMessagesService.create` à partir de `precision_request_at` du message
   * précédent du fil.
   */
  @Column('timestamptz', { nullable: true })
  quota_exempt_at: Date | null

  /**
   * #1931 (migration `CopilotCardsOnWorkflowRuns`) — half of a copilot card's
   * stable key (`copilotCardIdempotencyKey`, `@bellum/contracts`): which TURN
   * of the conversation this message belongs to. `null` for every message
   * that predates turns — a message without one simply cannot anchor a card.
   */
  @Column('uuid', { nullable: true })
  turn_id: string | null

  /**
   * #1939 — l'enregistrement d'un message VOCAL envoyé à Laura, tant qu'il est
   * conservé. `null` = message tapé (tout l'existant), ou enregistrement effacé
   * — 30 jours après le dépôt par la purge de 03:41, ou immédiatement à
   * l'effacement du compte.
   *
   * Posé par `ChatMessagesService.create` seulement après avoir vérifié que
   * l'objet appartient à CET utilisateur, dans CET espace, et au domaine
   * `chat_voice_message`. Migration `1792800080000-ChatVoiceMessages`
   * (`ON DELETE SET NULL` : la purge emporte le fichier, jamais le message).
   */
  @Column('uuid', { nullable: true })
  voice_object_id: string | null

  /**
   * #1953.22 — quand CETTE réponse a été REMPLACÉE par une branche (réessai,
   * autre angle, demande modifiée). `null` = elle ne l'a pas été, l'état de tout
   * l'existant.
   *
   * ⚠️ Remplacée ≠ supprimée. La ligne reste intacte, son texte reste lisible :
   * l'estampille ne sert qu'à afficher « Réponse remplacée à HH:MM — conservée
   * pour mémoire » et à rendre ses propositions non confirmables (#1953.14).
   * Sans elle, la marque ne survivait pas à un rechargement de page — défaut
   * mesuré en production le 16/09/2026. Migration `1795100482913`.
   */
  @Column('timestamptz', { nullable: true })
  superseded_at: Date | null

  /**
   * #1953.11 — la réponse dont CELLE-CI repart. `null` = ce message n'est la
   * réédition de rien (tout l'existant, et tout message tapé normalement).
   *
   * `ON DELETE SET NULL` : le lien se perd, jamais le message.
   */
  @Column('uuid', { nullable: true })
  branch_of_message_id: string | null

  /**
   * #1953.11 — la nature de la branche : `retry`, `angle` ou `edit`
   * (`CHAT_BRANCH_KINDS`, `@bellum/contracts`). `null` = aucune branche.
   * Contrainte `chat_messages_branch_kind_check`, posée AVANT ce code (GA-11).
   */
  @Column('text', { nullable: true })
  branch_kind: ChatBranchKind | null

  /**
   * #1914.14 — le CONTEXTE de cette réponse, tel qu'il sera RE-RENDU à la
   * relecture du fil : les sources citées, ce qui n'a pas été consulté, la
   * question de précision et ses options. `null` = aucun contexte gardé, ce qui
   * est l'état de tout l'existant, d'un message tapé et d'une réponse scriptée
   * de démonstration — l'écran n'affiche alors aucun panneau, exactement comme
   * avant ce lot.
   *
   * ⚠️ Une LISTE BLANCHE, tenue par `persistedChatContext` (`@bellum/contracts`)
   * et appliquée à la SEULE porte d'écriture (`ChatMessagesService.create`) :
   * les propositions brutes du modèle (D65), les droits du lecteur et les cartes
   * n'entrent jamais ici. Migration `1795100317864-ChatMessageContext`, ajoutée
   * AVANT le code qui écrit (GA-11/GA-12).
   */
  @Column('jsonb', { nullable: true })
  context: PersistedChatContext | null

  /**
   * #2494 — les pièces jointes ENVOYÉES avec ce message : leur identifiant
   * `rag_documents` et leur NOM, tel que retrouvé dans l'espace de l'appelant
   * au moment de l'écriture (`ChatMessagesService.resolveAttachments`) — jamais
   * le nom que le navigateur a proposé, jamais le contenu du fichier.
   *
   * `null` = aucune pièce jointe à ce message, l'état de tout l'existant :
   * avant cette colonne, le nom déposé dans le composeur ne survivait ni à
   * l'envoi (`attachedDocs` se vide) ni à un rechargement du fil.
   *
   * Additive et nullable (GA-11/GA-12). Migration `1795510000000-ChatMessageAttachments`.
   */
  @Column('jsonb', { nullable: true })
  attachments: { id: string; name: string }[] | null

  /**
   * #2876 (#2433.4) — les IMAGES de conversation ENVOYÉES avec ce message :
   * leur identifiant `storage_objects` (domaine `chat_image_attachment`,
   * #2876, 30 jours) et leur NOM, retrouvés dans l'espace de l'appelant au
   * moment de l'écriture (`ChatMessagesService.resolveImageAttachments`) —
   * jamais le nom envoyé par le navigateur, jamais le contenu de l'image.
   *
   * Distinct de `attachments` ci-dessus : celui-là désigne des pièces
   * DURABLES (`rag_documents`, cas b) ; une image de conversation (cas a,
   * éphémère) n'y a jamais eu d'`id` — elle vivait, avant cette colonne,
   * seulement sous une URL `blob:` locale, perdue au rechargement du fil et
   * invisible à qui relit le fil ensuite.
   *
   * #2433.4 / #2433.12 (lot W8) — chaque entrée garde aussi, quand elles ont été
   * mesurées, les `regions` (zones lues, cliquables) et les `objects` (bords du
   * document, grille d'un tableau) : sans elles, la preuve visuelle redevenait un
   * simple nom de fichier à la réouverture. Clés absentes = rien de mesuré.
   *
   * `null` = aucune image jointe à ce message, l'état de tout l'existant.
   * Additive et nullable (GA-11/GA-12). Migration `1796377300100-ChatMessageImageAttachments`.
   */
  @Column('jsonb', { nullable: true })
  image_attachments: PersistedChatImage[] | null

  /**
   * #2876 (décision Louis 14/10) — quand les ZONES VISION de ce message ont
   * été ARCHIVÉES (`ChatMessagesService.archiveExpiredImageVision`), ou
   * `null` tant qu'elles sont encore lisibles (l'état de tout l'existant).
   *
   * Posé une fois la rétention de l'image dépassée (30 jours,
   * `chat_image_attachment`) : la LIGNE n'est jamais touchée (« on archive,
   * on ne supprime pas »), seule la LECTURE change — `listThread` rend alors
   * un stub `{id, name}` par image, sans `regions` ni `objects`.
   *
   * Additive et nullable (GA-11/GA-12). Migration
   * `1796530327276-ChatMessageImageVisionArchivedAt`.
   */
  @Column('timestamptz', { nullable: true })
  image_vision_archived_at: Date | null
}

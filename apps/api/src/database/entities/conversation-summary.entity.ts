import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * A rolling, per-conversation summary ("long memory", Théo P2) so the copilot
 * remembers the gist of a thread across sessions without resending the whole
 * transcript.
 *
 * There is no dedicated `conversations` table — a "conversation" is a grouping
 * of `chat_messages` by `conversation_id`. Rather than add a redundant per-row
 * `summary` column to `chat_messages`, the rolling summary lives here as ONE row
 * per PERSON and per conversation, keyed by
 * `(user_id, workspace_id, conversation_id)`. `conversation_id` is TEXT (not
 * UUID) because the web uses synthetic thread keys ("general",
 * "account-<uuid>"); the service derives a stable key server-side. RLS scopes
 * rows to their owner (`auth.uid() = user_id`).
 *
 * ⚠️ La clé a longtemps été `(workspace_id, conversation_id)` — sans la
 * personne. Le web envoyant `conversation_id = "general"` pour le fil par
 * défaut, tous les membres d'un espace partageaient UNE ligne : des extraits de
 * ce qu'un collègue avait écrit à Laura entraient dans le prompt de chacun, ce
 * que D65 interdit. La clé porte désormais la personne, et l'index unique de la
 * base est PARTIEL (`WHERE superseded_at IS NULL`) : voir
 * `1790700047318-ConversationSummaryPerMember`.
 */
@Entity({ name: 'conversation_summaries' })
@Index('conversation_summaries_owner_uidx', ['user_id', 'workspace_id', 'conversation_id'], {
  unique: true,
  // #2439.10 — une ligne ARCHIVÉE n'est plus la ligne vivante de sa clé : sans
  // `archived_at IS NULL`, le premier message écrit après un oubli violerait
  // cette unicité (migration `1795997101839`).
  where: 'superseded_at IS NULL AND archived_at IS NULL',
})
export class ConversationSummaryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('text')
  conversation_id: string

  @Column('text', { default: '' })
  summary: string

  /**
   * Ligne écrite sous l'ancienne portée d'ESPACE : son texte mélange les mots de
   * plusieurs membres et rien ne dit qui a écrit quoi. Estampillée une fois par
   * `1790700047318-ConversationSummaryPerMember`, elle n'est plus jamais lue.
   * `null` = ligne vivante, c'est-à-dire tout ce que le code écrit depuis.
   *
   * On archive, on ne supprime pas : le contenu reste, la lecture cesse.
   */
  @Column('timestamptz', { nullable: true })
  superseded_at: Date | null

  /**
   * #1927.10 — L'ÉTAT STRUCTURÉ du fil : objets cités, dernière liste, dernière
   * recherche préparée, actions préparées, questions déjà posées. Émis par le
   * service IA à la fin d'un tour, validé par `conversationThreadStateSchema`
   * (@bellum/contracts) avant d'être écrit, relu et renvoyé au tour suivant.
   * `null` = aucun état connu, l'état de tout l'existant (migration
   * `1792800130000-ConversationThreadState`).
   *
   * Lu comme une donnée NON FIABLE à chaque lecture (une ligne écrite par une
   * version plus ancienne peut ne plus matcher le schéma) : jamais typé ici
   * comme s'il l'était déjà.
   */
  @Column('jsonb', { nullable: true })
  thread_state: Record<string, unknown> | null

  /**
   * #2439.10 — QUAND CETTE PERSONNE A OUBLIÉ CE RÉSUMÉ, depuis l'écran
   * Réglages › Mémoire de Laura. `null` = ligne vivante.
   *
   * DISTINCT de `superseded_at` ci-dessus, et les deux ne se remplacent pas :
   * `superseded_at` estampille une ligne écrite sous l'ANCIENNE portée d'espace
   * (un mélange de plusieurs membres, jamais relisible) ; `archived_at` est un
   * GESTE de la personne sur SA ligne. Confondre les deux ferait passer un
   * oubli pour une réparation de portée, et inversement.
   *
   * ⚠️ Exclue par `MemoryService.summaryScope` — donc par le résumé lu au tour
   * suivant, son détail d'écran, sa correction, l'état du fil et l'écriture du
   * tour — et par `ledgerConversations`. Migration `1795997101839` (jusqu'au
   * 21/09/2026, cet oubli était un DELETE SQL).
   */
  @Column('timestamptz', { nullable: true })
  archived_at: Date | null

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

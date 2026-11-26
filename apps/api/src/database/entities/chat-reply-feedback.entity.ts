import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #1919 — un retour d'UNE personne sur une réponse de Laura : « Utile », « Pas
 * pertinent » (et son motif), « Donnée fausse » (et sa correction), « Déjà
 * fait », « Pas maintenant », « Mauvaise priorité ».
 *
 * Cloisonné espace + auteur : c'est la mémoire de la personne, relue dans SON
 * prompt (`ReplyFeedbackService.memoryFor`), jamais dans celui d'un collègue et
 * jamais agrégée en analytique (doctrine c64) — SAUF l'agrégat des contestations PAR FONCTION, jamais par personne (3e exception nommée, 11/10/2026, #2442.10, `ReplyContestationsService`, GA-412). Pourquoi une table voisine et
 * non `account_feedback` : voir `packages/contracts/src/schemas/reply-feedback.ts`.
 *
 * #1919.14 — relié à sa réponse par une EMPREINTE (`reply_digest`) et, quand il
 * a pu être retrouvé, l'identifiant du message ; jamais le texte recopié.
 * Migration `1792800163417`.
 */
@Entity({ name: 'chat_reply_feedback' })
@Index('chat_reply_feedback_person_idx', ['workspace_id', 'user_id', 'created_at'])
@Index('chat_reply_feedback_digest_idx', ['workspace_id', 'reply_digest'])
export class ChatReplyFeedbackEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** L'auteur — toujours le JWT, jamais le corps. */
  @Column('uuid')
  user_id: string

  /** `replyDigest` (@bellum/contracts) du texte de la réponse. */
  @Column('text')
  reply_digest: string

  /** Le message `chat_messages` retrouvé par son empreinte, ou `null`. */
  @Column('uuid', { nullable: true })
  message_id: string | null

  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('uuid', { nullable: true })
  contact_id: string | null

  /** La nature de l'action que la réponse proposait (`prepare_message`…). */
  @Column('text', { nullable: true })
  action_kind: string | null

  /** `REPLY_FEEDBACK_VERDICTS` (CHECK nommé en base). */
  @Column('text')
  verdict: string

  /** `REPLY_FEEDBACK_REASONS` — seulement pour « pas pertinent ». */
  @Column('text', { nullable: true })
  reason: string | null

  /**
   * #2444.1 — `REPLY_FEEDBACK_CATEGORIES` : un axe de précision INDÉPENDANT du
   * verdict/motif, applicable à n'importe quel retour. Additif — migration
   * `1792900163417`.
   */
  @Column('text', { nullable: true })
  category: string | null

  /** Précision libre du motif « Autre » — citée, jamais réinterprétée. */
  @Column('text', { nullable: true })
  note: string | null

  /** #1919.7 — ce qui est faux, tel que la personne le nomme. */
  @Column('text', { nullable: true })
  correction_field: string | null

  /** #1919.7 — la bonne information, telle que la personne la donne. */
  @Column('text', { nullable: true })
  correction_value: string | null

  /** #1919.7 — `reply` (cette réponse) ou `account` (le dossier, pour l'équipe). */
  @Column('text', { nullable: true })
  correction_scope: string | null

  /** #1919.7 — la ligne `account_feedback` écrite quand le dossier a été corrigé. */
  @Column('uuid', { nullable: true })
  account_feedback_id: string | null

  /** GA-47 — la portée la plus fermée. Ce retour ne sert qu'à son auteur. */
  @Column('text', { default: 'tenant_private' })
  reuse_scope: string

  /** Retiré par son auteur : il ne pèse plus sur rien. On archive, on ne supprime pas. */
  @Column('timestamptz', { nullable: true })
  withdrawn_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

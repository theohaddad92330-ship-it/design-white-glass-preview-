import type { MemorySurface } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #1916.18 / #1916.24 — UN ÉLÉMENT DE MÉMOIRE ENVOYÉ À LAURA POUR UNE RÉPONSE.
 *
 * Une ligne = un élément qui était dans le contexte d'un tour. On prouve
 * l'ENVOI, pas l'usage : l'écran dit « consulté pour cette réponse », jamais
 * « utilisé ». Aucun contenu : des identifiants, une surface, une date.
 * Migration `1792800170859-ChatReplyMemoryUses`.
 */
@Entity({ name: 'chat_reply_memory_uses' })
export class ChatReplyMemoryUseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** L'espace du tour : toute lecture de la trace le borne. */
  @Column('uuid')
  workspace_id: string

  /** Qui a posé la question (le jeton). « Tout oublier » et l'effacement de compte partent de là. */
  @Column('uuid')
  user_id: string

  /**
   * Le tour, émis par l'API — jamais par le navigateur. Une réponse du chat est
   * enregistrée APRÈS le flux par le web (`POST /ia/chat/messages`) : le tour
   * voyage dans l'événement terminal, puis rattache ses lignes au message.
   */
  @Column('uuid')
  turn_id: string

  /** Où la réponse a été produite — `MEMORY_SURFACES` (CHECK SQL). */
  @Column('text')
  surface: MemorySurface

  /**
   * La réponse de Laura enregistrée. `null` : réponse d'un assistant externe
   * (pas un fil), ou tour du chat pas encore rattaché. Une conversation
   * supprimée emporte ses lignes (ON DELETE CASCADE).
   */
  @Column('uuid', { nullable: true })
  message_id: string | null

  /** L'élément envoyé. `null` = supprimé depuis (ON DELETE SET NULL) : « retiré depuis ». */
  @Column('uuid', { nullable: true })
  fact_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

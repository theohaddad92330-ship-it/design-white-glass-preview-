import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #3086 — un battement de coeur, jamais un fait durable. `thread_key` encode
 * `(accountId, conversationId)` en une seule colonne TEXT non nullable
 * (`ChatPresenceService.threadKeyOf`) : le fil PAR DÉFAUT porte les deux à
 * `null`, et Postgres ne traite jamais deux `NULL` comme égaux dans l'index
 * unique qu'un upsert doit retrouver (migration `1796321990410-ChatPresence`).
 *
 * Lue avec une fenêtre glissante côté service (`PRESENCE_TTL_MS`) : une ligne
 * plus vieille que la fenêtre est déjà « personne », sans geste de départ à
 * écrire — la personne ferme l'onglet, cesse d'envoyer son battement, et la
 * ligne redevient silencieuse toute seule.
 */
@Entity({ name: 'chat_presence' })
@Index('chat_presence_member_unique', ['workspace_id', 'thread_key', 'user_id'], { unique: true })
export class ChatPresenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** L'espace du fil. Jamais nul : c'est ce qui empêche la présence de fuiter. */
  @Column('uuid')
  workspace_id: string

  @Column('text')
  thread_key: string

  @Column('uuid')
  user_id: string

  @Column('timestamptz')
  updated_at: Date
}

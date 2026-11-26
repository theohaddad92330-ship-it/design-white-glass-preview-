import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * Le repère « depuis ma dernière connexion » du Journal d'activité (§8).
 *
 * Un SNAPSHOT par utilisateur, posé au sign-in — délibérément PAS un heartbeat
 * réécrit à chaque requête, qui collerait `last_seen_at` à « maintenant » et
 * viderait donc toujours la fenêtre « ce qui a changé ». La restitution lit
 * `previous_seen_at` (l'instant de la visite précédente), stable pour toute la
 * session courante ; `last_seen_at` matérialise le début de la session en cours.
 */
@Entity({ name: 'user_last_seen' })
export class UserLastSeenEntity {
  @PrimaryColumn('uuid')
  user_id: string

  @Column('timestamptz', { default: () => 'now()' })
  last_seen_at: Date

  /** Début de la session PRÉCÉDENTE = le repère « depuis quand » affiché.
   *  `null` = première visite jamais enregistrée (aucune « dernière connexion »). */
  @Column('timestamptz', { nullable: true })
  previous_seen_at: Date | null
}

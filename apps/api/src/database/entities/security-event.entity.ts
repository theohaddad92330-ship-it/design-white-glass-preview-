import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Épopée #2879 (#2442.14) — un événement de sécurité, back-office seulement.
 *
 * Aucune RLS, aucun `user_id` : ce n'est ni une donnée de compte ni une donnée
 * de personne (voir la migration `1796322009123`). Écrite par
 * `GlobalExceptionFilter` sur chaque 401/403, lue par
 * `ObservabilityAlertsService` pour l'alerte « accès refusés ».
 */
@Entity({ name: 'security_events' })
@Index('security_events_kind_created_at_idx', ['kind', 'created_at'])
export class SecurityEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** `SECURITY_EVENT_KINDS` (CHECK nommé en base) — une seule valeur aujourd'hui. */
  @Column('text')
  kind: string

  @Column('smallint')
  status_code: number

  /** `null` = refusé avant toute résolution d'espace (jeton absent ou invalide). */
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  /** La ROUTE seule — jamais la requête complète (aucun paramètre, aucun corps). */
  @Column('text')
  path: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

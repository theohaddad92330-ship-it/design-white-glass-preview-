import type { BackofficeAuditCategory, BackofficeAuditOutcome } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Une ligne du JOURNAL D'AUDIT UNIQUE du back-office (#1666).
 *
 * Les six colonnes de l'issue, nommées :
 *   Qui        `actor_email` + `actor_role`
 *   Quoi       `operation` + `category`
 *   Sur quoi   `subject_type` + `subject_id` + `subject_label`
 *   Quand      `created_at`
 *   Depuis où  `ip` + `user_agent` + `country`
 *   Résultat   `outcome` + `status_code` + `detail`
 *
 * ⚠️ AUCUNE COLONNE DE MISE À JOUR, ET AUCUNE MÉTHODE POUR EN ÉCRIRE UNE.
 * Un journal d'audit est en LECTURE SEULE : ce qui s'y écrit ne se corrige pas,
 * ne se masque pas, ne se supprime pas. L'absence de `updated_at` n'est pas un
 * oubli — c'est la forme que prend l'interdit dans le schéma. Le service qui
 * lit cette table n'expose ni `update`, ni `delete` par identifiant : on retire
 * le MOYEN, pas seulement la permission.
 *
 * ⚠️ `category` DÉCIDE de la rétention (24 mois / 36 mois / permanent). Ce
 * n'est pas une étiquette d'affichage : ranger une suppression en « ordinaire »
 * la ferait disparaître au bout de deux ans.
 *
 * ⚠️ AUCUNE CHARGE UTILE BRUTE. `detail` est une note courte écrite par
 * l'appelant, jamais un corps de requête recopié — voir le docblock de
 * `packages/contracts/src/schemas/backoffice-audit.ts`.
 */
@Entity({ name: 'backoffice_audit_events' })
@Index('idx_backoffice_audit_events_recent', ['created_at'])
@Index('idx_backoffice_audit_events_category', ['category', 'created_at'])
@Index('idx_backoffice_audit_events_actor', ['actor_email', 'created_at'])
export class BackofficeAuditEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** Le nom STABLE du geste, en `domaine.verbe` — `users.delete`, `email.reveal`. */
  @Column('text')
  operation: string

  @Column('text')
  category: BackofficeAuditCategory

  @Column('text')
  outcome: BackofficeAuditOutcome

  /**
   * ⚠️ NULLABLE, ET IL LE RESTE. La couche d'identité peut être au repos
   * (`DM_ALLOWED_EMAILS` non posée) : il n'y a alors PAS d'auteur nommé, et
   * écrire `'inconnu'` ferait d'une lacune un auteur.
   */
  @Column('text', { nullable: true })
  actor_email: string | null

  /** Le rôle relu dans `DM_ALLOWED_EMAILS` au moment du geste — jamais dans le cookie. */
  @Column('text', { nullable: true })
  actor_role: string | null

  /** La NATURE du sujet : `user`, `workspace`, `plan`, `queue`, `invoice`… */
  @Column('text', { nullable: true })
  subject_type: string | null

  /** Son identifiant technique, tel qu'il apparaît dans l'URL du geste. */
  @Column('text', { nullable: true })
  subject_id: string | null

  /** De quoi le reconnaître sans rouvrir la base. ⚠️ Jamais une adresse en clair. */
  @Column('text', { nullable: true })
  subject_label: string | null

  /** Le code HTTP rendu à l'opérateur, quand il y en a un. */
  @Column('int', { nullable: true })
  status_code: number | null

  /** ⚠️ Une note COURTE, jamais une charge utile de requête. */
  @Column('text', { nullable: true })
  detail: string | null

  /**
   * ⚠️ NULLABLES ET ILS LE RESTENT — même raison que le journal d'accès :
   * Vercel les fournit presque toujours, et « presque » n'est pas « toujours ».
   */
  @Column('text', { nullable: true })
  ip: string | null

  @Column('text', { nullable: true })
  user_agent: string | null

  @Column('text', { nullable: true })
  country: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

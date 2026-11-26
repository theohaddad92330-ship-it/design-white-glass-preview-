import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { NotificationType } from '@bellum/contracts'

/**
 * An in-app notification shown in the bell dropdown. `read_at` is null until the
 * user opens/acknowledges it. `link` (optional) deep-links into the app.
 * RLS scopes rows to their owner.
 */
@Entity({ name: 'notifications' })
@Index('notifications_user_created_idx', ['user_id', 'created_at'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  @Column('text')
  type: NotificationType

  @Column('text')
  title: string

  @Column('text', { default: '' })
  body: string

  @Column('text', { nullable: true })
  link: string | null

  @Column('timestamptz', { nullable: true })
  read_at: Date | null

  /** D'où vient le message — c'est ce qui décide s'il compte dans le plafond
   *  de proactivité. Un échec et une réponse à un geste passent toujours. */
  @Column('text', { default: 'user_triggered' })
  origin: string

  /** 0-100. `null` = pas de priorité calculée, ce qui n'est PAS « priorité
   *  nulle » — la seconde signifie « ne jamais notifier ». */
  @Column('int', { nullable: true })
  priority: number | null

  /** #2404.3 — le quadrant NOMMÉ de `priority` (`information`/`action`/
   *  `urgent`/`critical`), dérivé une fois à la création
   *  (`notificationLevelFor`, `@bellum/contracts`). `null` tant que
   *  `priority` l'est. JAMAIS lu par le budget de proactivité : il nomme, il
   *  ne décide pas. */
  @Column('text', { nullable: true })
  level: string | null

  /** Posé quand le message a dépassé le plafond : il reste visible dans le
   *  centre d'actions, sans avoir interrompu personne. */
  @Column('timestamptz', { nullable: true })
  suppressed_at: Date | null

  /** #2404.7 — D'OÙ vient l'information : ce que l'ESPACE a BRANCHÉ (sa
   *  messagerie Gmail/Outlook, son CRM) ou un registre public nommable
   *  (BOAMP, DECP) — JAMAIS un de nos fournisseurs d'enrichissement (Pappers,
   *  Apollo, Brave). `null` = l'émetteur ne sait pas nommer sa source —
   *  jamais devinée (GA-18/GA-19). */
  @Column('text', { nullable: true })
  source: string | null

  /** #3922.n — l'URL http(s) VÉRIFIABLE du signal que la notification cite
   *  (`readRecentSignals`), ou `null` : jamais devinée — l'écran dit alors
   *  « Sans lien vérifiable ». Distinct de `link`, la destination INTERNE. */
  @Column('text', { nullable: true })
  source_url: string | null

  /** #3922.n — le genre de cette source (`press` | `bodacc` | `job` | `tender` |
   *  `official` | `other`) : il nomme le lien. `null` avec `source_url`. */
  @Column('text', { nullable: true })
  source_kind: string | null

  /** #4158.14 — l'espace où le geste a eu lieu. `null` = notification
   *  personnelle (le produit, Laura), visible quel que soit l'espace actif. */
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  /** #4158.14 — l'auteur du geste (un collègue), pour l'écrire en clair.
   *  `null` = pas d'auteur humain. */
  @Column('uuid', { nullable: true })
  actor_user_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

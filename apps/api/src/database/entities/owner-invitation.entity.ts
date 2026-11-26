import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * L'e-mail d'activation du propriétaire d'un siège provisionné à la main,
 * PERSISTÉ — #2643.2.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE TABLE, ET POURQUOI ELLE N'EXISTAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `OwnerInvitation` (voir `manual-provisioning.service.ts`) vivait le temps
 * d'une réponse HTTP : une fois l'écran de création fermé, plus personne ne
 * pouvait dire où en était l'activation d'un siège — ni si le lien avait pu
 * être engendré, ni s'il avait été envoyé. Une ligne par espace fixe les deux,
 * et sert de point d'ancrage aux relances J+2/J+5 (#2643.3).
 *
 * ⚠️ `sent_at` / `sends` NE SONT JAMAIS ÉCRITS PAR LA PRÉPARATION — #1665 règle
 * 2, « pas d'envoi silencieux », étendue à l'administration interne (décision
 * Louis 20/09/2026, #2643.1). Seul un clic opérateur (`OwnerActivationService
 * .send`) les écrit.
 *
 * Un siège n'a qu'UNE invitation propriétaire : la ligne est mise à jour
 * (upsert sur `workspace_id`), jamais dupliquée.
 */
@Entity({ name: 'owner_invitations' })
export class OwnerInvitationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index({ unique: true })
  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  user_id: string

  @Column('text')
  email: string

  /** `null` quand l'opérateur n'a saisi aucun prénom — l'e-mail rendu dit
   *  alors « Bonjour, » plutôt que d'inventer un nom. */
  @Column('text', { nullable: true })
  owner_first_name: string | null

  @Column('text')
  esn_name: string

  @Column('text')
  plan_label: string

  /** `null` quand le lien de définition de mot de passe n'a pas pu être
   *  engendré — `error` dit pourquoi. */
  @Column('text', { nullable: true })
  link: string | null

  @Column('timestamptz', { nullable: true })
  expires_at: Date | null

  @Column('text', { nullable: true })
  error: string | null

  /** `null` = jamais envoyé. Le dernier envoi (initial ou relance). */
  @Column('timestamptz', { nullable: true })
  sent_at: Date | null

  /** L'opérateur authentifié qui a cliqué « Envoyer » la dernière fois —
   *  jamais deviné. */
  @Column('text', { nullable: true })
  sent_by: string | null

  /** Chaque envoi consigné, du plus ancien au plus récent — l'historique que
   *  l'écran affiche et sur lequel la cadence J+2/J+5 se calcule (#2643.3). */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  sends: Array<{ at: string; by: string }>

  /** Quand l'alerte interne d'inactivité a été journalisée — pour ne la
   *  journaliser qu'UNE fois par siège (#2643.3). `null` = jamais alertée.
   *  Jamais envoyée à l'extérieur : c'est une alerte ÉQUIPE, automatique. */
  @Column('timestamptz', { nullable: true })
  alerted_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

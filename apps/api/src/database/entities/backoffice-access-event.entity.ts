import type { BackofficeAccessEvent } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Une entrée du journal d'accès du back-office (#1671.2) — qui est entré, quand,
 * d'où, et ce qui a été refusé.
 *
 * ⚠️ SÉPARÉ DU JOURNAL D'ACTIONS (#1666, encore ouvert). Deux questions, deux
 * rétentions : l'accès dit « qui est entré » et se garde douze mois ; l'action
 * dit « qu'a-t-il fait » et se garde plus longtemps. Les fusionner rendrait l'un
 * des deux illisible et imposerait la rétention la plus longue à des données qui
 * n'en ont pas besoin.
 *
 * ⚠️ AUCUNE DONNÉE DE CLIENT ICI. Ni compte consulté, ni contact, ni contenu :
 * seulement des opérateurs et leurs entrées.
 */
@Entity({ name: 'backoffice_access_events' })
@Index('idx_backoffice_access_events_recent', ['created_at'])
@Index('idx_backoffice_access_events_actor', ['actor_email', 'event', 'created_at'])
export class BackofficeAccessEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('text')
  event: BackofficeAccessEvent

  /** L'adresse de l'opérateur. `null` quand l'événement n'en désigne aucun. */
  @Column('text', { nullable: true })
  actor_email: string | null

  /** Le rôle relu dans `DM_ALLOWED_EMAILS` au moment du geste — jamais dans le cookie. */
  @Column('text', { nullable: true })
  actor_role: string | null

  /** Ce que le refus dit, en un mot : `hors_liste`, `identifiants_refuses`, `mfa_absent`… */
  @Column('text', { nullable: true })
  reason: string | null

  /** ⚠️ Le diagnostic technique (code Supabase, statut). Il ne remonte JAMAIS à un écran de connexion. */
  @Column('text', { nullable: true })
  detail: string | null

  /**
   * ⚠️ NULLABLES ET ILS LE RESTENT. Vercel les fournit presque toujours, et
   * « presque » n'est pas « toujours ». Les remplir par `'inconnu'` ferait d'une
   * lacune un fait — et l'alerte « pays inhabituel » compterait `'inconnu'`
   * comme un pays.
   */
  @Column('text', { nullable: true })
  ip: string | null

  @Column('text', { nullable: true })
  user_agent: string | null

  @Column('text', { nullable: true })
  country: string | null

  /** Ce sur quoi portait le geste, quand l'événement en désigne un (une capacité, un écran). */
  @Column('text', { nullable: true })
  target: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

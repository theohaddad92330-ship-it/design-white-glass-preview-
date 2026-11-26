import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ACCOUNT_FOLLOW_ARCHIVE_REASONS } from '@bellum/contracts'

/**
 * #4267 — LE SUIVI D'UN COMPTE, GESTE EXPLICITE D'UN UTILISATEUR (migration `AccountFollows1796560290696`).
 *
 * Une ligne par (utilisateur, compte) : « Ne plus suivre » l'ARCHIVE (`archived_at` + `archived_reason`),
 * « Suivre » la réactive. Ligne ACTIVE = `archived_at IS NULL` — c'est elle, et elle seule, que la veille,
 * le rafraîchissement quotidien et les digests lisent (via {@link activeFollowExists}). Le statut commercial
 * ne dit plus si un compte est suivi.
 *
 * L'entité vit à côté de son module, comme `UserFavoriteEntity` : le module est autonome (règle #7).
 */
@Entity({ name: 'account_follows' })
@Index('account_follows_once', ['user_id', 'account_id'], { unique: true })
export class AccountFollowEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid')
  account_id: string

  @Column('timestamptz', { default: () => 'now()' })
  followed_at: Date

  @Column('timestamptz', { nullable: true })
  archived_at: Date | null

  @Column('text', { nullable: true })
  archived_reason: (typeof ACCOUNT_FOLLOW_ARCHIVE_REASONS)[number] | null

  /** 4267.4 — l'utilisateur a lu « On a gardé tes 3 comptes les plus récents » (une fois). */
  @Column('timestamptz', { nullable: true })
  notice_seen_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

/** Le nom de la table, à UN seul endroit : les lecteurs de veille la lisent en SQL, sans repository. */
export const ACCOUNT_FOLLOWS_TABLE = 'account_follows'

/**
 * 4267.1 — « ce compte est-il suivi ? » : la SEULE définition, partagée par tous les lecteurs de veille
 * (scheduler, worker, digests quotidien et hebdomadaire). `alias` = l'alias SQL du compte.
 */
export function activeFollowExists(alias: string): string {
  return `EXISTS (SELECT 1 FROM ${ACCOUNT_FOLLOWS_TABLE} follow WHERE follow.account_id = ${alias}.id AND follow.archived_at IS NULL)`
}

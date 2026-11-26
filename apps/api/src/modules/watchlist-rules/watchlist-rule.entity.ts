import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { WatchlistRuleKind } from '@bellum/contracts'

/**
 * Une règle PERSONNELLE de veille (restitution V2 §11) : « je veux suivre ce
 * secteur / cette techno / ce compte / ce besoin / cette personne ». Portée par
 * le WORKSPACE (la veille est une affaire d'équipe) ; `user_id` reste comme
 * attribution « créée par ». Le module est autonome (règle #7) : sa propre
 * table, aucun couplage. RLS (`auth.uid() = user_id`) est le filet de sécurité,
 * mais l'API tourne en service-role → la vraie barrière est le scoping
 * `workspace_id` côté service.
 */
@Entity({ name: 'watchlist_rules' })
@Index('watchlist_rules_workspace_idx', ['workspace_id'])
@Index('watchlist_rules_workspace_kind_value_uidx', ['workspace_id', 'kind', 'value'], { unique: true })
export class WatchlistRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  @Column('uuid')
  workspace_id: string

  /** L'un des 5 axes de personnalisation (`sector|techno|account|need|person`). */
  @Column('text')
  kind: WatchlistRuleKind

  /** Libellé libre saisi par le commercial (déjà trimé/borné par le contrat). */
  @Column('text')
  value: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

import type { NeedAutoMatchStatus } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'

/**
 * Le sort du matching AUTOMATIQUE d'un besoin entrant (#2916 / #2399.2,
 * `c93_matching_auto_besoin_entrant`). Raison complète : migration
 * `1796438100000-NeedAutoMatches`.
 *
 * La clé primaire EST le besoin : une ligne par besoin, jamais deux — c'est
 * l'idempotence, tenue par la base et non par une lecture préalable.
 */
@Entity({ name: 'need_auto_matches' })
@Index(['workspace_id', 'created_at'])
export class NeedAutoMatchEntity {
  @PrimaryColumn('uuid')
  need_id: string

  @Column('uuid')
  workspace_id: string

  /** Le membre qui a ACTIVÉ la routine — l'automatisation est attribuée à
   *  quelqu'un, jamais anonyme. Un AUTEUR, pas une clé de portée. */
  @Column('uuid')
  user_id: string

  @Column('text', { default: 'queued' })
  status: NeedAutoMatchStatus

  /** Le `MatchRun` écrit ; `null` tant qu'il n'existe pas. */
  @Column('uuid', { nullable: true })
  run_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

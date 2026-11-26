import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Objectif commercial chiffré par membre (cockpit manager §10). Un membre déclare,
 * pour un mois, une cible sur trois axes nullables — rendez-vous, comptes, chiffre
 * d'affaires. Voir la migration `1788230462911-MemberObjectives`.
 */
@Entity({ name: 'member_objectives' })
@Index('member_objectives_user_ws_month_uniq', ['user_id', 'workspace_id', 'period_month'], { unique: true })
export class MemberObjectiveEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  user_id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** 1er du mois visé (`YYYY-MM-01`). */
  @Column('date')
  period_month: string

  /** Cible de rendez-vous. `null` = axe non déclaré (pas de barre). */
  @Column('int', { nullable: true })
  target_meetings: number | null

  /** Cible de comptes ouverts. `null` = axe non déclaré. */
  @Column('int', { nullable: true })
  target_accounts: number | null

  /** Cible de chiffre d'affaires en euros. `numeric` → `string` via pg. `null` = non déclaré. */
  @Column('numeric', { nullable: true })
  target_revenue: string | null

  /** Cible de besoins qualifiés (lot FA, #2114.17). `null` = axe non déclaré. */
  @Column('int', { nullable: true })
  target_qualified_needs: number | null

  /** Cible de démarrages de mission (lot FA, #2114.18). `null` = axe non déclaré. */
  @Column('int', { nullable: true })
  target_placements: number | null

  /** Cible de marge en %. `numeric` → `string` via pg, comme `target_revenue`.
   *  `null` = axe non déclaré (lot FA, #2114.20). */
  @Column('numeric', { nullable: true })
  target_margin_percent: string | null

  /** Cible de consultants en mission (lot FA, #2114.22). `null` = axe non déclaré. */
  @Column('int', { nullable: true })
  target_consultants_on_mission: number | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

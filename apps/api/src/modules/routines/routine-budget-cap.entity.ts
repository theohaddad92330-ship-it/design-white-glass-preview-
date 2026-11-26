import type { RoutineKey } from '@bellum/contracts'
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

/**
 * #2843.19 — le PLAFOND de coût d'une routine pour UN utilisateur, réglé au
 * BACK-OFFICE seul (c132 : jamais lu ni affiché côté client). Migration
 * `RoutineBudgetCaps1796900101000`. Ligne absente = aucun plafond.
 */
@Entity({ name: 'routine_budget_caps' })
export class RoutineBudgetCapEntity {
  @PrimaryColumn('uuid')
  user_id: string

  @PrimaryColumn('text')
  routine_key: RoutineKey

  /** En dollars, l'unité des lignes `provider_costs` qu'il borne (numeric → string). */
  @Column('numeric', { precision: 12, scale: 4 })
  cost_cap_usd: string

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

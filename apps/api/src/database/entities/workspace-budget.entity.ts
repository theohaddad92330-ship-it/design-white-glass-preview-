import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Les cinq leviers admin de gouvernance de coût par espace (#2440.83-89,
 * épopée #2975). UNE ligne par espace — jamais agrégée entre espaces (GA-43).
 *
 * `null` sur un plafond = ce plafond n'est PAS réglé, jamais 0 : la porte
 * (`checkBudgetGate`, `@bellum/contracts`) le traite comme un no-op, comme
 * `COST_ALERT_DAILY_USD` absent pour l'alerte globale existante.
 */
@Entity({ name: 'workspace_budgets' })
export class WorkspaceBudgetEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid', { unique: true })
  workspace_id: string

  @Column('numeric', { nullable: true })
  monthly_budget_usd: string | null

  @Column('numeric', { nullable: true })
  per_member_cap_usd: string | null

  @Column('numeric', { nullable: true })
  per_action_cap_usd: string | null

  @Column('boolean', { default: true })
  alert_on_overage: boolean

  @Column('boolean', { default: false })
  block_at_cap: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

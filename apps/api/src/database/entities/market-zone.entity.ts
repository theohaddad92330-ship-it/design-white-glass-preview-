import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Capacité « Marchés locaux » (L1) — une zone d'un espace (départements français
 * ou cantons suisses) et le brief de marché qui s'y rattache. Le brief est du
 * JSON validé par `marketBriefSchema` (@bellum/contracts) à la LECTURE.
 *
 * Migration : `1796433901253-MarketZones`.
 */
@Entity({ name: 'market_zones' })
@Index(['workspace_id', 'slug'], { unique: true })
export class MarketZoneEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  slug: string

  @Column('text')
  label: string

  @Column('text')
  scope: 'france' | 'suisse'

  @Column('text', { array: true, default: () => "'{}'" })
  departments: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  cantons: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  cities: string[]

  @Column('jsonb', { nullable: true })
  brief: unknown | null

  @Column('text', { nullable: true })
  brief_origin: 'seed' | 'generated' | null

  @Column('timestamptz', { nullable: true })
  brief_generated_at: Date | null

  @Column('numeric', { nullable: true })
  brief_cost_usd: string | null

  @Column('text', { nullable: true })
  input_checksum: string | null

  @Column('uuid', { nullable: true })
  created_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

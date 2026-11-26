import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * BEL-SC-243 — REX PERTE (#3272.1) : le retour d'expérience d'une
 * opportunité perdue, bloquée ou classée no-go.
 *
 * `project_id` n'est PAS unique : contrairement à `rex_entries.mission_id`
 * (une mission ne se perd pas deux fois), une opportunité peut être rouverte
 * puis reperdue — chaque perte garde son propre REX (doctrine : on archive,
 * on ne supprime pas).
 */
@Entity('lost_deal_rex')
@Index(['workspace_id'])
@Index(['project_id'])
export class LostDealRexEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  project_id: string

  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('text', { nullable: true })
  perimeter: string | null

  @Column('text', { nullable: true })
  need: string | null

  @Column('text', { nullable: true })
  people_involved: string | null

  @Column('text', { nullable: true })
  real_decider: string | null

  @Column('text', { nullable: true })
  sponsor: string | null

  @Column('text', { nullable: true })
  route_used: string | null

  @Column('text', { nullable: true })
  proof_used: string | null

  @Column('text', { nullable: true })
  angle_tried: string | null

  @Column('text', { array: true, default: '{}' })
  angles_not_tried: string[]

  @Column('text', { nullable: true })
  last_action: string | null

  @Column('text', { nullable: true })
  last_action_distinction: string | null

  @Column('text', { nullable: true })
  declared_motif: string | null

  @Column('text', { nullable: true })
  declared_motif_note: string | null

  @Column('text', { nullable: true })
  declared_motif_distinction: string | null

  @Column('text', { nullable: true })
  suspected_motif: string | null

  @Column('text', { nullable: true })
  suspected_motif_note: string | null

  @Column('text', { nullable: true })
  suspected_motif_distinction: string | null

  @Column('text', { nullable: true })
  competitor: string | null

  @Column('text', { nullable: true })
  timing: string | null

  @Column('integer', { nullable: true })
  cycle_days: number | null

  @Column('text', { nullable: true })
  procurement_friction: string | null

  @Column('text', { nullable: true })
  consultant_gap: string | null

  @Column('text', { nullable: true })
  economics: string | null

  @Column('text', { nullable: true })
  what_team_knows_now: string | null

  @Column('text', { nullable: true })
  what_team_knows_now_distinction: string | null

  @Column('text', { nullable: true })
  revisit_on: string | null

  @Column('text', { array: true, default: '{}' })
  reuse_targets: string[]

  @Column('uuid', { nullable: true })
  created_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

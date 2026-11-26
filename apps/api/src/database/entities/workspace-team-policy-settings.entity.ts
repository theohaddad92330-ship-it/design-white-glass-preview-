import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import type { TeamPolicyWindow } from '@bellum/contracts'

/**
 * #2770.37 — LA POLITIQUE D'ÉQUIPE, réglage d'espace saisi par un gestionnaire
 * (migration `1796440017293-WorkspaceTeamPolicySettings`). Une ligne par espace ;
 * aucune ligne = « aucune politique d'équipe saisie ». Lue par Laura quand elle
 * organise une journée ou une semaine — voir `WorkspaceTeamPolicySettingsService`.
 */
@Entity({ name: 'workspace_team_policy_settings' })
export class WorkspaceTeamPolicySettingsEntity {
  @PrimaryColumn('uuid')
  workspace_id: string

  /** Plages protégées pour la prospection (minutes depuis minuit) — aucune réunion, seuls les blocs de prospection. */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  prospecting_windows: TeamPolicyWindow[]

  /** Créneaux interdits (minutes depuis minuit) — aucun bloc proposé. */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  forbidden_windows: TeamPolicyWindow[]

  /** Plafond de réunions par jour ; `NULL` = non saisi, jamais 0. */
  @Column('integer', { nullable: true })
  max_meetings_per_day: number | null

  /** Objectif d'appels par jour ; `NULL` = non saisi, jamais 0. */
  @Column('integer', { nullable: true })
  daily_call_target: number | null

  /** Le gestionnaire qui a posé la politique en dernier. */
  @Column('uuid', { nullable: true })
  updated_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

/**
 * #2035.11 — LE RÉGLAGE D'ESPACE DE LA CHARGE COMMERCIALE, en un seul endroit.
 *
 * ⚠️ #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes.
 * Cette table est celle de la PRODUCTION (migration `1795725445531`) ; le
 * plafond de dossiers suivis que la vague 3 avait posé sur
 * `workspace_commercial_load_capacity_settings` l'a REJOINTE par `ADD COLUMN`
 * (migration `1795995017405-WorkspaceSettingsFusion`). `max_open_needs` n'a pas
 * bougé : il était déjà ici, il y reste — un réglage vit à un seul endroit
 * (GA-26), et il était défini des deux côtés avant cette fusion.
 *
 * `max_open_needs` borne le nombre de besoins OUVERTS (`project_needs.status`,
 * `NEED_OPEN_STATUSES`) qu'un commercial (`project_needs.owner_id`) porte à la
 * fois avant d'être considéré « à charge » ; `OpenNeedsService.list` le lit
 * pour faire remonter d'abord les besoins dont le porteur a encore de la
 * marge. `max_tracked_accounts` borne les dossiers suivis
 * (`accounts.assigned_to`). Deux CAPACITÉS déclarées, jamais un score ni une
 * probabilité : des entiers comparés à un compte réel.
 *
 * UNE ligne par espace, créée au premier changement ; aucune ligne = le défaut
 * de code (`DEFAULT_MAX_OPEN_NEEDS`, aucun plafond de dossiers).
 * `max_tracked_accounts = NULL` se dit « non renseigné », jamais « 0 dossier »
 * (GA-18/GA-19).
 */
@Entity({ name: 'workspace_commercial_load_settings' })
export class WorkspaceCommercialLoadSettingsEntity {
  @PrimaryColumn('uuid')
  workspace_id: string

  @Column('integer', { default: 15 })
  max_open_needs: number

  /** Nombre maximal de dossiers suivis (`accounts.assigned_to`) par commercial. */
  @Column('integer', { nullable: true })
  max_tracked_accounts: number | null

  /**
   * #3245 (reste de #3209.3) — heures commerciales disponibles PAR SEMAINE,
   * déclarées par l'espace. `NULL` = « non renseigné », jamais 0 heure
   * (GA-18/GA-19). Première pièce du budget d'effort réel — voir
   * `AccountsService.effortBudget`.
   */
  @Column('integer', { nullable: true })
  weekly_available_hours: number | null

  /**
   * #3289.29 — le jour de la semaine imposé aux relances de cadence (`monday`…`friday`).
   * `NULL` = « non renseigné » : le jour appris, puis le rythme nominal, s'appliquent.
   */
  @Column('text', { nullable: true })
  cadence_weekday: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

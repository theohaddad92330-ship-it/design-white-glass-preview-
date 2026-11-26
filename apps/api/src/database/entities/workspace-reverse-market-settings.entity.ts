import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

/**
 * #2035.10 — LE RÉGLAGE D'ESPACE DU MARCHÉ INVERSÉ, en un seul endroit.
 *
 * ⚠️ #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes.
 * Deux vagues du 21/09/2026 ont construit ce sujet deux fois. Cette table est
 * celle de la PRODUCTION (migration `1795725441307`) ; les réglages que la
 * vague 3 avait posés sur `workspace_reverse_market_capacity_settings` l'ont
 * REJOINTE par `ADD COLUMN` (migration `1795995017405-WorkspaceSettingsFusion`),
 * et cette seconde table — jamais déployée — a disparu du dépôt. Un réglage vit
 * à un seul endroit (GA-26).
 *
 * UNE ligne par espace, créée au premier changement ; aucune ligne = les
 * défauts de code (`DEFAULT_MAX_RECRUITERS_SHOWN`, marché fermé, capacité non
 * renseignée) — le comportement d'avant ces lots, à l'octet près.
 *
 * Les trois réglages du sujet :
 * - `max_recruiters_shown` — combien de recruteurs (le second marché, §6.2)
 *   `ReverseMarketService.forTalent` remonte par consultant ;
 * - `enabled` — le marché inversé est-il ouvert pour cet espace ;
 * - `response_capacity_per_week` — combien de sollicitations l'espace accepte
 *   de traiter par semaine.
 *
 * 🔴 Ce sont des CAPACITÉS configurées, jamais des probabilités : le nombre de
 * lignes affichées et ce que l'espace accepte de traiter, jamais une chance de
 * réponse. `response_capacity_per_week = NULL` se dit « non renseignée »,
 * jamais « 0 » (GA-18/GA-19) — zéro se lirait « ne traite aucune
 * sollicitation », l'inverse d'une absence de réglage.
 */
@Entity({ name: 'workspace_reverse_market_settings' })
export class WorkspaceReverseMarketSettingsEntity {
  @PrimaryColumn('uuid')
  workspace_id: string

  @Column('integer', { default: 10 })
  max_recruiters_shown: number

  @Column('boolean', { default: false })
  enabled: boolean

  @Column('integer', { nullable: true })
  response_capacity_per_week: number | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

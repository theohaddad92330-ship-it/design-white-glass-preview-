import type { SignalImportance } from '@bellum/contracts'
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Un signal historisé (restitution V2 §11 — « historique de signal »).
 * Ce que le blob `accounts.recent_signals` ne peut pas dire, parce qu'il est
 * réécrit à chaque analyse : depuis quand on voit ce signal, s'il a bougé,
 * quand on l'a vu pour la dernière fois, et s'il a disparu.
 * Voir la migration `1787952416309-SignalHistory`.
 */
@Entity({ name: 'signal_history' })
export class SignalHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  // Scope équipe (comme accounts/opportunities). Nullable tant que le roll-out
  // user_id → workspace_id est en cours ; c'est le scope de lecture.
  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Index()
  @Column('uuid')
  account_id: string

  /** Identité du signal dans le compte : libellé normalisé (minuscules, trimé). */
  @Column('text')
  signal_key: string

  /** Dernier libellé observé (brut, tel qu'affiché). */
  @Column('text')
  label: string

  @Column('text', { nullable: true })
  signal_type: string | null

  @Column('text', { nullable: true })
  source: string | null

  /** Date DU signal telle que produite par l'IA (texte libre : « juillet 2026 »). */
  @Column('text', { nullable: true })
  signal_date: string | null

  /** current | archive | undated — fraîcheur estampillée par l'IA. */
  @Column('text', { nullable: true })
  freshness: string | null

  /** active = présent dans la dernière analyse ; resolved = a disparu. */
  @Column('text', { default: 'active' })
  status: string

  /** Première fois que Bellum a vu ce signal — jamais réécrite par un re-run. */
  @Column('timestamptz')
  first_detected_at: Date

  /** false pour les lignes issues du backfill : on sait seulement que le signal
   *  était DÉJÀ là à cette date, pas qu'il y est apparu. L'UI dit alors « suivi
   *  depuis », jamais « détecté le ». */
  @Column('boolean', { default: true })
  first_detection_exact: boolean

  /** Dernière matérialisation où le signal était présent (= sa fraîcheur réelle). */
  @Column('timestamptz')
  last_seen_at: Date

  /** Dernière fois que son contenu (libellé/date/source/type/fraîcheur) a bougé. */
  @Column('timestamptz', { nullable: true })
  last_changed_at: Date | null

  @Column('int', { default: 0 })
  change_count: number

  /** Date à laquelle le signal a cessé d'apparaître dans l'analyse. */
  @Column('timestamptz', { nullable: true })
  resolved_at: Date | null

  /**
   * Pondération `high | medium | low` DÉRIVÉE de règles déjà en vigueur
   * (`signalImportance`, `@bellum/contracts`) — jamais un score inventé.
   * `null` quand rien ne situe le signal dans le temps : l'écran n'affiche alors
   * aucune importance. Migration `1788241729466`.
   */
  @Column('text', { nullable: true })
  importance: SignalImportance | null

  /** L'action (`action_plan_items`) que ce signal a effectivement déclenchée.
   *  `null` tant qu'il n'a rien produit — jamais un rapprochement deviné. */
  @Column('uuid', { nullable: true })
  action_id: string | null

  /** #3206.2 (partiel, épopée #3240) — la dernière fois qu'un commercial a
   *  confirmé que ce signal tenait toujours. `null` tant que personne n'a
   *  cliqué « Marquer vérifié » — jamais déduite d'une re-détection : une
   *  observation n'est pas une vérification. Migration `1796376590347`. */
  @Column('timestamptz', { nullable: true })
  last_verified_at: Date | null
}

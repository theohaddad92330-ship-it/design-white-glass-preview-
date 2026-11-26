import type { ActionPlanOutcome } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * A user-trackable action-plan item. One row per action of the generated plan,
 * seeded from `action_plans.weeks` the first time an account's plan is read
 * (see `ActionPlanItemsService.listForAccount`). Unlike `action_plans` (the
 * immutable generated output) this table is *owned by the user*: `done` /
 * `due_date` persist so the checklist survives a reload and overdue items feed
 * the daily "Rappels de relance" notification.
 *
 * `week_index` / `step_index` are the 0-based position of the action inside the
 * generated plan (phase index, action index) — the natural key the web board
 * uses to overlay this persisted state onto the plan it renders from
 * `raw_analysis`. `last_reminded_on` is the dedup marker for the relance cron
 * (at most one reminder per item per calendar day). RLS scopes rows to their
 * owner; every query is additionally scoped by `user_id` (defence in depth).
 */
@Entity({ name: 'action_plan_items' })
@Index('action_plan_items_user_account_idx', ['user_id', 'account_id'])
export class ActionPlanItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  @Column('uuid')
  account_id: string

  /** The `action_plans` row this item was derived from (null if orphaned). */
  @Column('uuid', { nullable: true })
  source_plan_id: string | null

  @Column('text')
  label: string

  @Column('int', { default: 0 })
  week_index: number

  @Column('int', { default: 0 })
  step_index: number

  @Column('boolean', { default: false })
  done: boolean

  /**
   * Executable lifecycle state: `todo` | `done` | `snoozed` (Théo P1/P2 —
   * "les actions doivent être exécutables"). Kept in sync with `done` server-side
   * so the legacy checkbox flow keeps working: `done` ⇒ `done`, un-done ⇒ `todo`.
   */
  @Column('text', { default: 'todo' })
  // #2123.37 — `prepared` en fin, contrainte élargie par 1793700352123.
  // #2317.12 — `obsolete` en fin, contrainte élargie par 1796321999947.
  execution_status: 'todo' | 'done' | 'snoozed' | 'prepared' | 'obsolete'

  /** ISO timestamp the item is parked until when snoozed (null otherwise). */
  @Column('timestamptz', { nullable: true })
  snoozed_until: Date | null

  /** Workspace member id the action is delegated to (null = unassigned). */
  @Column('uuid', { nullable: true })
  assigned_to: string | null

  /**
   * #4158.31 — la note de contexte écrite en déléguant l'action à un collègue, et
   * celui qui l'a écrite. Colonnes ajoutées par `1796523337902` ; `null` sur toute
   * ligne antérieure et sur toute action non déléguée.
   */
  @Column('text', { nullable: true })
  handoff_note: string | null

  @Column('uuid', { nullable: true })
  handoff_by: string | null

  /**
   * #2123.46 — le responsable SAISI à la main au formulaire du plan (« Sophie »).
   * Ce n'est pas {@link assigned_to} : un prénom tapé ne délègue rien et n'ouvre
   * aucun droit. Colonne ajoutée par `1793700400000` ; `null` sur toutes les
   * lignes antérieures.
   */
  @Column('text', { nullable: true })
  owner_name: string | null

  /**
   * #2123.46 — le résultat attendu et l'indicateur, tels que la veille, la fiche
   * contact, le panneau besoin et l'ajout en masse les écrivaient dans
   * `raw_analysis.user_plan_actions`. Colonnes ajoutées par `1795380046123` ;
   * `null` sur toutes les lignes antérieures.
   */
  @Column('text', { nullable: true })
  expected_outcome: string | null

  @Column('text', { nullable: true })
  kpi: string | null

  /**
   * #2395.4/#2395.9 (correctif de collecte, 24/09/2026) — le CANAL déjà écrit
   * par le plan de Laura pour cette action (`apps/ia/app/models/outputs/
   * plan.py` : `linkedin | email | phone | event | meeting | content`), gardé
   * SEULEMENT quand il correspond à un canal déjà canonique. C'est ce que le
   * TYPE et l'ATTENDU canoniques (`packages/contracts/src/schemas/action.ts`)
   * lisent pour se déterminer sans deviner — voir `readChannel`,
   * `ActionPlanItemsService.seedFromPlan`. Colonne ajoutée par
   * `1796001457744` (avec la contrainte SQL, GA-11/GA-12) ; `null` sur toutes
   * les lignes antérieures et sur les items manuels où aucun canal n'a été
   * saisi.
   */
  @Column('text', { nullable: true })
  channel: 'phone' | 'email' | 'linkedin' | 'meeting' | null

  /**
   * #2153.57 — le résultat, DÉCLARATIF, distinct de {@link expected_outcome}/
   * {@link kpi} (l'attendu, avant le geste). Colonne ajoutée par
   * `1795620000001`.
   */
  @Column('text', { nullable: true })
  result: string | null

  /**
   * Moteur de cadence multi-touch (Drive #8). When set, this item is a
   * follow-up touch of a contact's relance sequence rather than a plan-derived
   * checklist row: `contact_id` links it to the contact and `cadence_step` names
   * the touch (`relance` | `preuve_sociale` | `close_loop`). Both NULL ⇒ a
   * normal plan item — the plan checklist (`listForAccount`) filters those in and
   * cadence rows out, while the relance cron scans by `due_date`/`done` and picks
   * up either kind for free.
   */
  @Column('uuid', { nullable: true })
  contact_id: string | null

  @Column('text', { nullable: true })
  cadence_step: 'initial' | 'relance' | 'preuve_sociale' | 'close_loop' | null

  /**
   * #2123.1-.10 — l'objet canonique visé par l'action : sa nature (l'une des
   * huit de `ACTION_TARGET_KINDS`), son identifiant dans SON référentiel, et le
   * libellé que l'humain lit. Les trois sont NULL sur les lignes écrites avant
   * la règle — on archive, on ne supprime pas. `target_id` est du TEXT et non
   * un UUID : une tâche CRM et une clé de vérification n'en sont pas.
   */
  @Column('text', { nullable: true })
  target_kind: string | null

  @Column('text', { nullable: true })
  target_id: string | null

  @Column('text', { nullable: true })
  target_label: string | null

  /**
   * #2123.21-.31 — ce qu'une action doit porter pour être exécutable : sa
   * raison, l'action dont elle dépend, sa provenance (source ET date), sa
   * confiance et son coût.
   *
   * ⚠️ `confidence` et `cost_credits` sont NULLABLES SANS défaut : « non
   * mesuré » est un état, et un `DEFAULT 0` aurait transformé « on ne sait
   * pas » en « c'est gratuit » sur toutes les lignes (GA-18 / GA-19).
   */
  @Column('text', { nullable: true })
  reason: string | null

  @Column('uuid', { nullable: true })
  depends_on_item_id: string | null

  @Column('text', { nullable: true })
  source: 'human' | 'connector' | 'pipeline' | 'model' | null

  @Column('timestamptz', { nullable: true })
  source_at: Date | null

  @Column('text', { nullable: true })
  confidence: 'high' | 'medium' | 'low' | null

  @Column('int', { nullable: true })
  cost_credits: number | null

  /** Calendar date `YYYY-MM-DD` (no timezone). TypeORM maps `date` to string. */
  @Column('date', { nullable: true })
  due_date: string | null

  @Column('timestamptz', { nullable: true })
  completed_at: Date | null

  /** Last calendar day a relance reminder fired for this item (dedup marker). */
  @Column('date', { nullable: true })
  last_reminded_on: string | null

  /**
   * #2396.2/.5 — l'issue choisie à la complétion manuelle. `null` = non
   * complétée, ou ligne antérieure à la règle. Contrainte par
   * `1795999493771-ActionPlanItemOutcome`, élargie par
   * `1796373516686-ActionPlanItemOutcomeExpanded` (#3265.3). Le type vient du
   * contrat (`ActionPlanOutcome`) plutôt que d'une seconde énumération
   * littérale ici — GA-26, et c'est ce qui a laissé passer les 15 valeurs
   * neuves : une union recopiée ici ne bouge pas avec `ACTION_PLAN_OUTCOMES`.
   */
  @Column('text', { nullable: true })
  outcome: ActionPlanOutcome | null

  /**
   * #2396.1 — comment l'action a été complétée (manuelle/preuve/événement/
   * proposée). `null` = pas encore complétée. Seul `manual` a aujourd'hui un
   * chemin d'écriture réel — voir le docblock de `ACTION_COMPLETION_MODES`.
   */
  @Column('text', { nullable: true })
  completion_mode: 'manual' | 'proof' | 'event' | 'proposed' | null

  /** #3287 (#3265.2) — QUELLE recommandation a produit l'action (≠ `source`, qui dit QUI). */
  @Column('text', { nullable: true })
  source_recommendation: string | null

  /** #3287 (#3265.2) — la règle du corpus méthode (`METHOD_CORPUS_V1`) sous laquelle l'action a été posée. */
  @Column('text', { nullable: true })
  method_rule: string | null

  /** #3287 (#3265.2) — l'identifiant fournisseur (événement d'agenda…) quand le geste a été exécuté hors de Bellum. */
  @Column('text', { nullable: true })
  external_execution_id: string | null

  /** #3287 (#3265.2) — ce qui arrête CETTE action précise (≠ la condition d'arrêt de la motion). */
  @Column('text', { nullable: true })
  stop_condition: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

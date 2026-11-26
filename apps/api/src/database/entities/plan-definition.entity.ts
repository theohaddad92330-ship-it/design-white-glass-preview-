import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

/**
 * The editable billing plan catalog. Previously a hardcoded `PLAN_CONFIG` const;
 * now a DB table so the operator backoffice can change a plan's name / price /
 * caps / seats live in prod with no code deploy.
 *
 * `key` is the stable plan identifier (PK) — `trial | starter | team | growth |
 * beta`. Editing a row changes the TEMPLATE used on the NEXT checkout /
 * assignPlan; it does NOT retroactively rewrite existing subscribers' stored caps
 * (those live on `subscriptions` and are only written at assign / checkout /
 * webhook time).
 *
 * Loaded/cached by {@link PlanCatalogService}, which falls back to the shipped
 * `PLAN_CATALOG_DEFAULTS` when the table is empty/unmigrated so enforcement never
 * crashes. Seeded verbatim from those defaults by the `PlanDefinitions` migration.
 */
@Entity({ name: 'plan_definitions' })
export class PlanDefinitionEntity {
  @PrimaryColumn('text')
  key: string

  @Column('text', { default: '' })
  label: string

  /** Monthly price in cents (Stripe convention). */
  @Column('integer', { default: 0 })
  price_cents: number

  @Column('integer', { default: 0 })
  accounts_limit: number

  @Column('integer', { default: 0 })
  enrichment_credits: number

  @Column('integer', { default: 3 })
  seats: number

  /** Monthly price in cents of ONE seat beyond `seats` (per-plan add-on). */
  @Column('integer', { default: 2900 })
  extra_seat_price_cents: number

  /** Self-serve checkout allowed. Operator-only plans (trial/beta) are false. */
  @Column('boolean', { default: true })
  self_serve: boolean

  /**
   * Les features que ce palier ouvre (clés de `PLAN_FEATURE_KEYS`, contrat
   * partagé). Éditable comme le reste du catalogue : c'est la grille de gating
   * par offre, pas une constante de code.
   *
   * JSON libre côté base — le contenu n'est donc JAMAIS lu tel quel : la couche
   * catalogue le repasse par `normalizePlanFeatures`, qui jette les clés
   * inconnues. Une ligne écrite avant la colonne lit `[]` ; c'est la migration
   * qui l'ouvre en grand (toutes les features), pas ce défaut — un plan seedé à
   * vide serait un plan muet.
   */
  @Column('jsonb', { default: () => `'[]'::jsonb` })
  features: string[]

  /**
   * Prix DÉCLARÉS dans les autres devises, posés par l'opérateur.
   *
   * Forme : `{ "usd": { "priceCents": 12900, "extraSeatPriceCents": 3200 }, … }`.
   * `price_cents` / `extra_seat_price_cents` restent la référence EURO et ne
   * bougent pas. Une devise absente n'est PAS un prix à zéro : elle n'est pas
   * vendue dans cette devise, et le client est facturé en euros — Bellum ne
   * convertit rien (un taux appliqué à la volée change entre l'affichage et le
   * prélèvement). JSON libre côté base, donc jamais lu tel quel : la couche
   * catalogue le repasse par le contrat des devises.
   */
  @Column('jsonb', { default: () => `'{}'::jsonb` })
  prices: Record<string, { priceCents: number; extraSeatPriceCents: number }>

  @Column('integer', { default: 0 })
  sort_order: number

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}

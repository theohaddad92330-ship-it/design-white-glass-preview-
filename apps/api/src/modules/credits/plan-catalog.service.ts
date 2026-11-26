import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  ALL_PLAN_FEATURES,
  type CurrencyPriceTable,
  normalizePlanFeatures,
  type PlanFeatureKey,
  sanitizeCurrencyPrices,
} from '@bellum/contracts'
import { Repository } from 'typeorm'
import { PlanDefinitionEntity } from '../../database/entities/plan-definition.entity'
import {
  applyPlanFeatureMonotonicity,
  cloneDefaultCatalog,
  normalizePlanKey,
  PLAN_CATALOG_DEFAULTS,
  type PlanDefinition,
  type PlanKey,
} from './plan-catalog.defaults'

/** How long a loaded catalog is trusted before the next read re-reads the DB. A
 *  write refreshes immediately, so this only bounds staleness of an edit made on
 *  ANOTHER replica. */
const CACHE_TTL_MS = 30_000

/** The fields an operator may edit on a plan (v1). `self_serve` / `sort_order`
 *  are not editable — creating/deleting plans is out of scope. */
export type PlanCatalogPatch = {
  label?: string
  /** Monthly price in cents. */
  price?: number
  accounts_limit?: number
  enrichment_credits?: number
  seats?: number
  /** Monthly price in cents of one extra seat. */
  extra_seat_price?: number
  /** Les features ouvertes par le palier. Liste COMPLÈTE (pas un delta) : une
   *  liste vide ferme tout, ce qui est une décision légitime — donc on ne peut
   *  pas la confondre avec « champ non fourni ». */
  features?: PlanFeatureKey[]
  /** Prix déclarés dans les autres devises. Relu et nettoyé avant écriture : la
   *  colonne est du JSON libre, et un montant mal formé ne doit jamais devenir
   *  un prix. */
  prices?: CurrencyPriceTable
}

/**
 * DB-backed billing plan catalog — the single source of truth that replaced the
 * hardcoded `PLAN_CONFIG` const. Loads `plan_definitions` into an in-memory cache
 * (short TTL + refreshed on every write) and exposes it to enforcement/billing
 * code exactly as the const did.
 *
 * SAFETY: the cache is seeded with {@link PLAN_CATALOG_DEFAULTS} at construction,
 * so a read is ALWAYS answerable — even before the first DB load, on an empty /
 * un-migrated table, or if the DB read fails. Rows present in the DB overlay the
 * defaults; a missing key falls back to its default. This guarantees enforcement
 * never crashes and, because the seed is byte-identical to the old const, it
 * behaves identically the moment it ships.
 *
 * Editing a plan changes the TEMPLATE used by the NEXT assign/checkout; it does
 * NOT retroactively rewrite existing subscribers' stored caps (those live on
 * `subscriptions`). No enforcement math changed — only its data source.
 */
@Injectable()
export class PlanCatalogService implements OnModuleInit {
  private readonly logger = new Logger(PlanCatalogService.name)
  private cache: Record<string, PlanDefinition> = cloneDefaultCatalog()
  private loadedAt = 0

  constructor(
    @InjectRepository(PlanDefinitionEntity)
    private readonly repo: Repository<PlanDefinitionEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh()
  }

  /**
   * Reload the cache from the DB. Rows overlay the factory defaults, so a missing
   * key always falls back to its default. Empty table or DB error → keep the
   * current (default-backed) cache so enforcement never crashes.
   */
  async refresh(): Promise<void> {
    try {
      const rows = await this.repo.find()
      const next = cloneDefaultCatalog()
      for (const row of rows) {
        next[row.key] = {
          key: row.key,
          label: row.label,
          price: row.price_cents,
          accounts_limit: row.accounts_limit,
          enrichment_credits: row.enrichment_credits,
          seats: row.seats,
          // Tolerate a row written before the column existed (or a null slipped
          // in): fall back to the shipped default rather than propagate an
          // `undefined` that would make every later edit fail validation.
          extra_seat_price:
            typeof row.extra_seat_price_cents === 'number'
              ? row.extra_seat_price_cents
              : (next[row.key]?.extra_seat_price ?? PLAN_CATALOG_DEFAULTS.starter.extra_seat_price),
          self_serve: row.self_serve,
          // Colonne JSON libre : jamais lue telle quelle. `normalizePlanFeatures`
          // jette les clés inconnues — une faute de frappe dans le backoffice ne
          // crée pas une feature fantôme, elle ferme la porte.
          //
          // MAIS on distingue « pas de valeur » de « liste vide » : une ligne
          // écrite avant la colonne (ou une base où la migration n'a pas encore
          // tourné) n'a PAS décidé de fermer les portes — elle retombe sur le
          // défaut ouvert. Seul un tableau réellement présent fait foi, y compris
          // vide : c'est alors un choix d'opérateur, et on l'applique.
          features: Array.isArray(row.features)
            ? normalizePlanFeatures(row.features)
            : (next[row.key]?.features ?? [...ALL_PLAN_FEATURES]),
          // Même prudence que `features` : colonne JSON libre, donc relue et non
          // recopiée. Une devise inconnue ou un montant non entier est JETÉ —
          // une faute de frappe dans le backoffice ne doit pas produire un prix.
          prices: sanitizeCurrencyPrices(row.prices),
          sort_order: row.sort_order,
        }
      }
      // PLAN-01 : un palier supérieur porte au moins ce que porte celui d'en
      // dessous. La table est éditable sans revue et s'était figée pendant que
      // de nouvelles clés arrivaient — d'où des clients Growth devant des écrans
      // qu'un ancien Pro ouvrait. La règle s'applique ICI, sur la lecture, pour
      // que l'inversion soit impossible et pas seulement réparée une fois.
      this.cache = applyPlanFeatureMonotonicity(next)
      this.loadedAt = Date.now()
    } catch (err) {
      this.logger.error('Failed to load plan_definitions; keeping current catalog', {
        error: err,
        tags: { 'plans.op': 'refresh_failed' },
      })
    }
  }

  private async ensureFresh(): Promise<void> {
    if (Date.now() - this.loadedAt > CACHE_TTL_MS) await this.refresh()
  }

  /** Resolve a raw plan string (metadata / DB) to a canonical key, mapping legacy
   *  aliases. Delegates to the pure {@link normalizePlanKey}. */
  normalizePlanKey(value: string | null | undefined): PlanKey | undefined {
    return normalizePlanKey(value)
  }

  /**
   * Strict lookup by exact key — byte-identical to the former `PLAN_CONFIG[key]`
   * (returns `undefined` for a non-catalog key). Callers that normalise legacy
   * aliases do so explicitly via {@link normalizePlanKey}, exactly as the old code
   * did, so webhook/enforcement behaviour is unchanged.
   */
  async get(key: string): Promise<PlanDefinition | undefined> {
    await this.ensureFresh()
    return this.cache[key]
  }

  /** Like {@link get} but guaranteed non-undefined for a canonical key (falls back
   *  to the shipped default). Use where a valid plan is required (checkout/assign). */
  async getOrDefault(key: PlanKey): Promise<PlanDefinition> {
    return (await this.get(key)) ?? PLAN_CATALOG_DEFAULTS[key]
  }

  /** All plans, ordered by `sort_order` (backoffice list). */
  async all(): Promise<PlanDefinition[]> {
    await this.ensureFresh()
    return Object.values(this.cache).sort((a, b) => a.sort_order - b.sort_order)
  }

  /** Keyed record view — used by the public `/credits/plans` endpoint and the
   *  legacy `getPlanConfig()` accessor. */
  async asRecord(): Promise<Record<string, PlanDefinition>> {
    await this.ensureFresh()
    return { ...this.cache }
  }

  /** `key → price (cents)` grid — used by the analytics MRR estimator. */
  async priceGridCents(): Promise<Record<string, number>> {
    await this.ensureFresh()
    const grid: Record<string, number> = {}
    for (const [key, def] of Object.entries(this.cache)) grid[key] = def.price
    return grid
  }

  /** `key → extra-seat price (cents)` grid — used by the analytics MRR estimator. */
  async seatPriceGridCents(): Promise<Record<string, number>> {
    await this.ensureFresh()
    const grid: Record<string, number> = {}
    for (const [key, def] of Object.entries(this.cache)) grid[key] = def.extra_seat_price
    return grid
  }

  /**
   * Operator edit of an EXISTING plan's editable fields (v1 — no create/delete).
   * Validates the key is a known catalog key and the numeric fields are
   * non-negative integers, upserts the row, then refreshes the cache so the new
   * template takes effect immediately for the next assign/checkout. Does NOT touch
   * any `subscriptions` row — existing subscribers keep their stored caps.
   */
  async update(key: string, patch: PlanCatalogPatch): Promise<PlanDefinition> {
    const normalized = normalizePlanKey(key)
    if (!normalized || !(normalized in PLAN_CATALOG_DEFAULTS)) {
      throw new NotFoundException(`Unknown plan '${key}'`)
    }
    const current = (await this.get(normalized)) ?? PLAN_CATALOG_DEFAULTS[normalized]
    const next: PlanDefinition = { ...current }
    if (patch.label !== undefined) next.label = patch.label
    if (patch.price !== undefined) next.price = patch.price
    if (patch.accounts_limit !== undefined) next.accounts_limit = patch.accounts_limit
    if (patch.enrichment_credits !== undefined) next.enrichment_credits = patch.enrichment_credits
    if (patch.seats !== undefined) next.seats = patch.seats
    if (patch.extra_seat_price !== undefined) next.extra_seat_price = patch.extra_seat_price
    // Idem : on ne fait pas confiance à ce qui arrive, même par un endpoint admin.
    if (patch.features !== undefined) next.features = normalizePlanFeatures(patch.features)
    if (patch.prices !== undefined) next.prices = sanitizeCurrencyPrices(patch.prices)

    for (const [field, value] of Object.entries({
      price: next.price,
      accounts_limit: next.accounts_limit,
      enrichment_credits: next.enrichment_credits,
      seats: next.seats,
      extra_seat_price: next.extra_seat_price,
    })) {
      if (!Number.isInteger(value) || value < 0) {
        throw new BadRequestException(`Invalid ${field}: must be a non-negative integer`)
      }
    }

    await this.repo.upsert(
      {
        key: normalized,
        label: next.label,
        price_cents: next.price,
        accounts_limit: next.accounts_limit,
        enrichment_credits: next.enrichment_credits,
        seats: next.seats,
        extra_seat_price_cents: next.extra_seat_price,
        features: next.features,
        prices: next.prices,
        // Not operator-editable in v1 — preserve the current value.
        self_serve: current.self_serve,
        sort_order: current.sort_order,
        updated_at: new Date(),
      },
      ['key'],
    )
    await this.refresh()
    return (await this.get(normalized)) ?? next
  }
}

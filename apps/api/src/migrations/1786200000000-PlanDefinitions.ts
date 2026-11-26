import { MigrationInterface, QueryRunner } from 'typeorm'
import { PLAN_CATALOG_DEFAULTS, PLAN_KEYS } from '../modules/credits/plan-catalog.defaults'

/**
 * `plan_definitions` — the editable billing plan catalog. Turns the former
 * hardcoded `PLAN_CONFIG` const into a DB table so the operator backoffice can
 * change a plan's name / price / caps / seats live in prod with no code deploy.
 *
 * Seeded VERBATIM from {@link PLAN_CATALOG_DEFAULTS} (which the golden parity test
 * freezes byte-identical to the old `PLAN_CONFIG`), so behaviour is unchanged the
 * moment it ships: {@link PlanCatalogService} reads the same numbers it used to
 * read from the const. Building the INSERTs from the shared constant guarantees
 * the seed can never drift from the service's fallback defaults.
 *
 * `ON CONFLICT (key) DO NOTHING` makes the seed idempotent and — crucially —
 * NON-destructive: a re-run (or a concurrent release racing `migration:run`)
 * never overwrites a value an operator has since edited live.
 *
 * RLS is enabled with no policy: this is global operator config, never read via
 * the browser/anon Supabase client. The API touches it through its direct
 * Postgres role (which bypasses RLS), same as the other backend-owned tables.
 */
export class PlanDefinitions1786200000000 implements MigrationInterface {
  public name = 'PlanDefinitions1786200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS plan_definitions (
        key TEXT PRIMARY KEY,
        label TEXT NOT NULL DEFAULT '',
        price_cents INTEGER NOT NULL DEFAULT 0,
        accounts_limit INTEGER NOT NULL DEFAULT 0,
        enrichment_credits INTEGER NOT NULL DEFAULT 0,
        seats INTEGER NOT NULL DEFAULT 3,
        self_serve BOOLEAN NOT NULL DEFAULT true,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    // Les paliers qui existaient à l'écriture de cette migration. FIGÉ : un palier
    // ajouté plus tard (ex. `decouverte`) arrive dans SA migration, pas ici —
    // l'historique doit rester ce qu'il était le jour où il a tourné.
    const SEEDED_AT_THE_TIME = PLAN_KEYS.filter(k => k !== 'decouverte')

    for (const key of SEEDED_AT_THE_TIME) {
      const d = PLAN_CATALOG_DEFAULTS[key]
      await queryRunner.query(
        `INSERT INTO plan_definitions
           (key, label, price_cents, accounts_limit, enrichment_credits, seats, self_serve, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (key) DO NOTHING`,
        [key, d.label, d.price, d.accounts_limit, d.enrichment_credits, d.seats, d.self_serve, d.sort_order],
      )
    }

    // Global operator config — locked to the API's service role (no browser/anon
    // access). Enable RLS with no policy so anon/authenticated Supabase clients
    // can't read/write it; the API's Postgres role bypasses RLS.
    await queryRunner.query(`ALTER TABLE plan_definitions ENABLE ROW LEVEL SECURITY`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

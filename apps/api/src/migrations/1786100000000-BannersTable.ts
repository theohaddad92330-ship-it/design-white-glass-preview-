import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Admin-scheduled banners / announcements. Operator-managed (backoffice) and
 * read live by the front-ends via a public endpoint. Bilingual content
 * (FR + EN), a scheduling window, placement + audience targeting, a styling
 * variant and an ordering priority. `version` is bumped on every save so a
 * re-published banner reappears past a client-side dismissal.
 *
 * The partial index on `(placement, priority DESC)` covers the hot public
 * query, which only ever reads `active = true` rows.
 */
export class BannersTable1786100000000 implements MigrationInterface {
  public name = 'BannersTable1786100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS banners (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kind text NOT NULL CHECK (kind IN ('announcement', 'maintenance', 'offer')),
        variant text NOT NULL DEFAULT 'info' CHECK (variant IN ('info', 'success', 'warning', 'critical')),
        title_fr text NOT NULL,
        title_en text NOT NULL,
        body_fr text NOT NULL DEFAULT '',
        body_en text NOT NULL DEFAULT '',
        cta_label_fr text,
        cta_label_en text,
        cta_url text,
        placement text NOT NULL DEFAULT 'app' CHECK (placement IN ('app', 'website', 'both')),
        audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'authenticated')),
        starts_at timestamptz,
        ends_at timestamptz,
        dismissible boolean NOT NULL DEFAULT true,
        priority integer NOT NULL DEFAULT 0,
        active boolean NOT NULL DEFAULT true,
        version integer NOT NULL DEFAULT 1,
        created_by text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_banners_active_placement
        ON banners (placement, priority DESC)
        WHERE active = true
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

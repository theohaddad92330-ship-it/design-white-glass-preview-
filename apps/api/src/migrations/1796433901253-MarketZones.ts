import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Capacité « Marchés locaux » (04/10/2026, lot L1) — les zones d'un espace et
 * le brief de marché de chacune.
 *
 * Les contraintes CHECK reprennent les enums de
 * `@bellum/contracts/schemas/market-brief.ts` (`MARKET_SCOPES`), posées AVANT le
 * code qui les écrit (GA-11/GA-12). `workspace_id` porte `ON DELETE CASCADE` :
 * une FK sans suppression en cascade a déjà cassé le reset de la démo en silence.
 *
 * Scopée par `workspace_id` : le brief d'un espace n'est jamais lu par un autre
 * (GA-43, les espaces sont des concurrents). `brief_origin` dit d'où vient le
 * brief (`seed` = classeur fourni, `generated` = calculé par Bellum).
 */
export class MarketZones1796433901253 implements MigrationInterface {
  name = 'MarketZones1796433901253'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS market_zones (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id      uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        slug              text NOT NULL,
        label             text NOT NULL,
        scope             text NOT NULL,
        departments       text[] NOT NULL DEFAULT '{}',
        cantons           text[] NOT NULL DEFAULT '{}',
        cities            text[] NOT NULL DEFAULT '{}',
        brief             jsonb,
        brief_origin      text,
        brief_generated_at timestamptz,
        brief_cost_usd    numeric,
        input_checksum    text,
        created_by        uuid,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT market_zones_scope_check CHECK (scope IN ('france', 'suisse')),
        CONSTRAINT market_zones_brief_origin_check CHECK (brief_origin IS NULL OR brief_origin IN ('seed', 'generated')),
        CONSTRAINT market_zones_workspace_slug_unique UNIQUE (workspace_id, slug)
      )
    `)

    await queryRunner.query(`ALTER TABLE market_zones ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`DROP POLICY IF EXISTS "market_zones_member_read" ON market_zones`)
    await queryRunner.query(`
      CREATE POLICY "market_zones_member_read" ON market_zones FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS market_zones`)
  }
}

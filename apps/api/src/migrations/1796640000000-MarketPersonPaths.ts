import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Lot 775 (Louis 02/11/2026) — `market_person_paths` : les parcours individuels de la mémoire marché, SANS identité.
 * Ajout seul : une table neuve, rien n'est réécrit. RLS activée sans politique : comme les autres `market_*`, seule
 * l'API (rôle service) la lit, par `MarketMemoryService`. Aucune colonne d'identifiant direct (garde GA-352).
 */
export class MarketPersonPaths1796640000000 implements MigrationInterface {
  public name = 'MarketPersonPaths1796640000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS market_person_paths (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        row_key          text NOT NULL,
        person_key       text NOT NULL,
        company_key      text NOT NULL,
        company_name     text,
        match_key        text,
        siren            text,
        job_title        text,
        role_family      text,
        skills           text[] NOT NULL DEFAULT '{}',
        start_date       text,
        ended_on         text,
        date_precision   text,
        work_status      text NOT NULL DEFAULT 'inconnu',
        esn_name         text,
        esn_key          text,
        daily_rate_eur   integer,
        mission_city     text,
        mission_region   text,
        corpus_label     text NOT NULL,
        dataset_version  text,
        source_checksum  text,
        methodology_version text,
        source_family    text,
        source_artifact_uri text,
        period_start     text,
        period_end       text,
        imported_at      timestamptz,
        created_at       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT market_person_paths_status_check CHECK (work_status IN ('freelance', 'esn', 'salarie', 'inconnu')),
        CONSTRAINT market_person_paths_precision_check CHECK (date_precision IS NULL OR date_precision IN ('day', 'month', 'year')),
        CONSTRAINT market_person_paths_rate_check CHECK (daily_rate_eur IS NULL OR daily_rate_eur > 0)
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS market_person_paths_row_key_uq ON market_person_paths (row_key)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS market_person_paths_company_key_idx ON market_person_paths (company_key)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS market_person_paths_person_key_idx ON market_person_paths (person_key)`,
    )
    await queryRunner.query(`ALTER TABLE market_person_paths ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS market_person_paths`)
  }
}

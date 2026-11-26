import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Lot 783 (#5205, Louis 03/11/2026) — le stockage du pack marché v2.1 (139 tables hétérogènes, 2,3 M lignes) en
 * BASE COMMUNE. Ajout seul : trois tables neuves, rien n'est réécrit.
 *
 *  · `market_v2_datasets`        — UNE ligne par (version du pack, table source) CHARGÉE : sha256 du fichier, lignes
 *                                  attendues / lues / écrites / rejetées, colonnes pii. Sa présence = la table est
 *                                  chargée à cette version (rejeu idempotent, reprise).
 *  · `market_v2_rows`            — une ligne par ligne CSV, cellules NON pii en `data jsonb`, `account_id` extrait
 *                                  (jointure `accounts`, BM-A-nnnnnn) quand il n'est pas pii.
 *  · `market_v2_row_identities`  — le COFFRE : les cellules `pii=1` de la même ligne, séparées physiquement. Aucun
 *                                  lecteur hors l'importeur (garde `market-v2-pii-never-read.spec.ts`).
 *
 * Pas de suppression à la nouvelle version : la clé porte `dataset_version` (on archive, on ne supprime pas) ; le
 * lecteur lit la dernière version chargée de SA table. L'effacement RGPD d'une personne passe par le coffre
 * (`ON DELETE CASCADE` depuis la ligne). Pas de GIN sur `data` : aucun lecteur n'existe encore, chaque surface
 * posera l'index d'expression de SA requête (un GIN sur 2,3 M lignes se paie à chaque import sans être lu).
 *
 * RLS activée sans politique : comme les autres tables de marché, seule l'API (rôle service) y accède.
 */
export class MarketV2Rows1796900104000 implements MigrationInterface {
  public name = 'MarketV2Rows1796900104000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS market_v2_datasets (
        dataset_version text NOT NULL,
        source_table    text NOT NULL,
        folder          text NOT NULL,
        file_sha256     text,
        expected_rows   integer NOT NULL,
        rows_read       integer NOT NULL DEFAULT 0,
        rows_written    integer NOT NULL DEFAULT 0,
        rows_rejected   integer NOT NULL DEFAULT 0,
        pii_columns     text[] NOT NULL DEFAULT '{}',
        loaded_at       timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (dataset_version, source_table),
        CONSTRAINT market_v2_datasets_version_check CHECK (dataset_version ~ '^[0-9a-f]{64}$'),
        CONSTRAINT market_v2_datasets_folder_check CHECK (
          folder IN ('data', 'data_pseudonymized', 'data_restricted_internal_crm', 'data_restricted_pii', 'refs')
        ),
        CONSTRAINT market_v2_datasets_counts_check CHECK (
          expected_rows >= 0 AND rows_read >= 0 AND rows_written >= 0 AND rows_rejected >= 0
        )
      )
    `)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS market_v2_rows (
        dataset_version text NOT NULL,
        source_table    text NOT NULL,
        row_no          integer NOT NULL,
        account_id      text,
        data            jsonb NOT NULL DEFAULT '{}'::jsonb,
        PRIMARY KEY (dataset_version, source_table, row_no),
        CONSTRAINT market_v2_rows_dataset_fk FOREIGN KEY (dataset_version, source_table)
          REFERENCES market_v2_datasets (dataset_version, source_table) ON DELETE CASCADE,
        CONSTRAINT market_v2_rows_row_no_check CHECK (row_no > 0),
        CONSTRAINT market_v2_rows_data_object_check CHECK (jsonb_typeof(data) = 'object')
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS market_v2_rows_account_idx ON market_v2_rows (account_id, source_table) WHERE account_id IS NOT NULL`,
    )
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS market_v2_row_identities (
        dataset_version text NOT NULL,
        source_table    text NOT NULL,
        row_no          integer NOT NULL,
        data            jsonb NOT NULL,
        PRIMARY KEY (dataset_version, source_table, row_no),
        CONSTRAINT market_v2_row_identities_row_fk FOREIGN KEY (dataset_version, source_table, row_no)
          REFERENCES market_v2_rows (dataset_version, source_table, row_no) ON DELETE CASCADE,
        CONSTRAINT market_v2_row_identities_not_empty_check CHECK (jsonb_typeof(data) = 'object' AND data <> '{}'::jsonb)
      )
    `)
    await queryRunner.query(`ALTER TABLE market_v2_datasets ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`ALTER TABLE market_v2_rows ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`ALTER TABLE market_v2_row_identities ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS market_v2_row_identities`)
    await queryRunner.query(`DROP TABLE IF EXISTS market_v2_rows`)
    await queryRunner.query(`DROP TABLE IF EXISTS market_v2_datasets`)
  }
}

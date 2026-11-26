import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Lot 793 (Louis 04/11/2026 : « absolument tout doit être rattaché, lié, et accessible par n'importe quel angle ») —
 * LE RÉFÉRENTIEL PIVOT entre les trois espaces d'identifiants d'entreprise :
 *
 *  · `BM-A-nnnnnn` — le référentiel `accounts` du pack v2.1 (`market_v2_rows`), 60 756 entreprises ;
 *  · `DF-xxxx`     — les 1 195 fiches `dataforge_accounts` (base commune, besoins ORION) ;
 *  · le compte d'un ESPACE (uuid) — jamais stocké ici : il se RÉSOUT à la lecture (`common-account-links.ts`).
 *
 * Une ligne = UNE clé de résolution normalisée (SIREN, domaine racine du site, nom ou alias normalisé) → UNE entreprise
 * commune (`common_id` = le BM-A, à défaut la fiche DF). La même clé portée par plusieurs entreprises fait plusieurs
 * lignes : c'est l'ambiguïté, que le résolveur DIT et ne tranche pas (on propose une fusion, on ne fusionne jamais).
 *
 * Ajout seul : une table neuve, rien n'est réécrit. Écrite par le script opérateur `ingest:common-account-links` seul
 * (idempotent : une ligne absente du dernier calcul sort — une clé périmée redevient inconnue). Base commune : aucune
 * donnée d'un espace n'y entre ; RLS activée sans politique, seule l'API (rôle service) la lit.
 */
export class CommonAccountLinks1796900170000 implements MigrationInterface {
  public name = 'CommonAccountLinks1796900170000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS common_account_links (
        key_kind            text NOT NULL,
        key_value           text NOT NULL,
        common_id           text NOT NULL,
        bm_account_id       text,
        dataforge_source_id text,
        group_account_id    text,
        company_name        text NOT NULL,
        origins             text[] NOT NULL DEFAULT '{}',
        built_at            timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (key_kind, key_value, common_id),
        CONSTRAINT common_account_links_key_kind_check CHECK (key_kind IN ('siren', 'domain', 'name')),
        CONSTRAINT common_account_links_key_value_check CHECK (
          length(key_value) > 0 AND (key_kind <> 'siren' OR key_value ~ '^[0-9]{9}$')
        ),
        CONSTRAINT common_account_links_bm_check CHECK (bm_account_id IS NULL OR bm_account_id ~ '^BM-A-[0-9]+$'),
        CONSTRAINT common_account_links_df_check CHECK (dataforge_source_id IS NULL OR dataforge_source_id ~ '^DF-'),
        CONSTRAINT common_account_links_group_check CHECK (
          group_account_id IS NULL OR (bm_account_id IS NOT NULL AND group_account_id ~ '^BM-A-[0-9]+$')
        ),
        CONSTRAINT common_account_links_common_id_check CHECK (
          common_id = COALESCE(bm_account_id, dataforge_source_id)
        ),
        CONSTRAINT common_account_links_origins_check CHECK (
          cardinality(origins) > 0
          AND origins <@ ARRAY['market_v2_accounts', 'market_v2_aliases', 'dataforge_accounts']::text[]
        ),
        CONSTRAINT common_account_links_name_check CHECK (length(btrim(company_name)) > 0)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS common_account_links_common_idx ON common_account_links (common_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS common_account_links_group_idx ON common_account_links (group_account_id) WHERE group_account_id IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS common_account_links_df_idx ON common_account_links (dataforge_source_id) WHERE dataforge_source_id IS NOT NULL`,
    )
    await queryRunner.query(`ALTER TABLE common_account_links ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS common_account_links`)
  }
}

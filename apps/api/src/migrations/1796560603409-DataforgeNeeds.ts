import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4281.1 / #4282.5 (19/10/2026, décision Louis n°17) — les BESOINS
 * HISTORIQUES du référentiel DataForge, STRUCTURÉS.
 *
 * Avant : statut / date / prescripteur d'un besoin n'existaient que dans le
 * texte des extraits RAG (`dataforge_rag_chunks`) ; `dataforge_account_domains`
 * ne porte qu'un TJM médian par compte × domaine. `24_MISSIONS_BESOINS` (1 336
 * lignes) et `25_PIPELINE_CRM_*` du pack ORION V12 n'étaient pas ingérés
 * (`agent_docs/orion-v12-2026-08-31.md` §5).
 *
 * Une ligne = un besoin observé. Le TYPÉ (statut normalisé, dates ISO, TJM,
 * prescripteur, technologies du radar) est ce que l'analyse et Laura lisent ;
 * `payload` garde TOUTES les autres colonnes brutes (« toutes les données ont
 * de la valeur »). `account_source_id` rejoint `dataforge_accounts.source_id`
 * SANS FK — jointure partielle par construction, comme les tables ORION V12.
 *
 * PARTAGÉE (GA-16, base commune décision n°18) : un fait de MARCHÉ — qui a
 * acheté quelle compétence, quand — pas le portefeuille d'un client.
 * RLS activée sans policy : seul le rôle service (API, IA) lit et écrit.
 *
 * GA-11/GA-12 : `status` et `source_file` sont fermés ICI, avant le code qui écrit.
 */
export class DataforgeNeeds1796560603409 implements MigrationInterface {
  name = 'DataforgeNeeds1796560603409'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dataforge_needs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        data_version text NOT NULL,
        source_file text NOT NULL,
        need_id text NOT NULL,
        account_source_id text,
        entreprise text,
        title text,
        description text,
        domain text,
        status text NOT NULL DEFAULT 'INCONNU',
        status_raw text,
        need_date date,
        starts_on date,
        ends_on date,
        tjm_eur real,
        prescriber_name text,
        prescriber_title text,
        prescriber_last_seen date,
        location text,
        technologies text[] NOT NULL DEFAULT '{}',
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT dataforge_needs_status_check CHECK (status IN (
          'GAGNE', 'PERDU', 'ABANDONNE', 'TERMINE', 'EN_COURS', 'INCONNU'
        )),
        CONSTRAINT dataforge_needs_source_file_check CHECK (source_file IN (
          '24_MISSIONS_BESOINS', '25_PIPELINE_CRM'
        )),
        CONSTRAINT dataforge_needs_tjm_check CHECK (tjm_eur IS NULL OR tjm_eur > 0)
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS dataforge_needs_source_need_unique ON dataforge_needs (source_file, need_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS dataforge_needs_account_idx ON dataforge_needs (account_source_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS dataforge_needs_technologies_idx ON dataforge_needs USING gin (technologies)`,
    )
    await queryRunner.query(`ALTER TABLE dataforge_needs ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS dataforge_needs`)
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Add the NAF/APE code column on accounts (Théo restitution p.41 : « comptes
 * similaires » doit s'appuyer sur le code NAF de l'entité pour trouver des
 * entreprises RÉELLEMENT du même secteur, au lieu d'un match texte flou sur le
 * libellé de secteur). Persisté depuis la recherche Phase 1 (`nafCode`).
 *
 * SAFE : simple ajout de colonne nullable, aucun backfill destructif. Les lignes
 * existantes restent NULL jusqu'à leur prochaine analyse (qui stampe le code) ;
 * une backfill best-effort extrait le code d'un éventuel `activity_label` déjà
 * présent dans `raw_analysis` (« 62.01Z - … » → « 62.01Z »).
 */
export class AccountNafCode1784900400000 implements MigrationInterface {
  public name = 'AccountNafCode1784900400000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS naf_code text
    `)

    // Best-effort backfill from raw_analysis.activity_label ("62.01Z - Prog…").
    // Only touches rows that already carry a leading NAF-shaped token; the rest
    // stay NULL and get stamped on their next run.
    await queryRunner.query(`
      UPDATE accounts
      SET naf_code = substring(raw_analysis->>'activity_label' from '^\\s*(\\d{2}[.\\d]*[A-Z]?)')
      WHERE naf_code IS NULL
        AND raw_analysis ? 'activity_label'
        AND raw_analysis->>'activity_label' ~ '^\\s*\\d{2}'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS naf_code`)
  }
}

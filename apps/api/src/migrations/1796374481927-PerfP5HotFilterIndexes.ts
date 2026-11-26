import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Perf P5 (29/09/2026) — les index des filtres chauds de la fiche compte, des
 * contacts et des routines. Aucune colonne, aucune donnée : des index seuls,
 * `IF NOT EXISTS`, réversibles.
 *
 *  - `contacts (workspace_id, created_at DESC, id DESC) WHERE deleted_at IS NULL`
 *    — `GET /contacts` trie `created_at DESC, id DESC` sous `workspace_id` et
 *    `deleted_at IS NULL` (mesuré jusqu'à 5,8 s) : sans lui Postgres trie tout
 *    l'espace avant de rendre 25 lignes.
 *  - `contacts (workspace_id, created_at) WHERE cardinality(tags) > 0` — le filtre
 *    « étiquettes » (`GET /contacts/tags`, 2,3 s) ne lit que les contacts qui en
 *    portent ; la requête pose le même prédicat `cardinality(tags) > 0`.
 *  - `accounts (workspace_id, created_at) WHERE cardinality(tags) > 0` — même
 *    raison pour `GET /accounts/tags`.
 *  - `contacts (workspace_id, account_id) WHERE email_verified = true AND
 *    deleted_at IS NULL` — le badge de navigation « prêts à traiter »
 *    (`GET /contacts/counts/ready-to-process`, 3,2 s) ne compte que les contacts
 *    à adresse vérifiée, une petite partie de la table.
 *  - `routine_runs (user_id, routine_key, created_at DESC)` — la dernière
 *    exécution de chaque routine (`GET /routines`), lue par un `DISTINCT ON`.
 *
 * SAFE : `CREATE INDEX IF NOT EXISTS`, pas de `CONCURRENTLY` (le migrateur
 * exécute dans une transaction). Les tables concernées tiennent en quelques
 * dizaines de milliers de lignes : la construction est brève.
 */
export class PerfP5HotFilterIndexes1796374481927 implements MigrationInterface {
  public name = 'PerfP5HotFilterIndexes1796374481927'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_contacts_workspace_recent
         ON contacts (workspace_id, created_at DESC, id DESC)
       WHERE deleted_at IS NULL`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_contacts_workspace_tagged
         ON contacts (workspace_id, created_at)
       WHERE cardinality(tags) > 0`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_accounts_workspace_tagged
         ON accounts (workspace_id, created_at)
       WHERE cardinality(tags) > 0`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_contacts_workspace_email_verified
         ON contacts (workspace_id, account_id)
       WHERE email_verified = true AND deleted_at IS NULL`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_routine_runs_user_key_recent
         ON routine_runs (user_id, routine_key, created_at DESC)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_routine_runs_user_key_recent`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_contacts_workspace_email_verified`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_accounts_workspace_tagged`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_contacts_workspace_tagged`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_contacts_workspace_recent`)
  }
}

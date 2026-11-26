import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4597.3 — retrouver UN import précis : chaque fiche (contact, compte) CRÉÉE par l'import universel porte
 * l'identifiant du job (`universal_import_jobs.id`), pour ouvrir la liste filtrée sur CET import — jamais sur sa date.
 *
 * NULLABLE, additive, sans backfill : une fiche importée AVANT cette colonne n'a pas d'identifiant d'import, et
 * deviner son import d'après une fenêtre de dates inventerait une appartenance (on archive, on ne réécrit pas).
 * Pas de clé étrangère : un job purgé ne doit pas toucher aux fiches. L'index est partiel (la plupart des lignes
 * n'en ont pas).
 */
export class ImportJobIdOnRecords1796575257285 implements MigrationInterface {
  name = 'ImportJobIdOnRecords1796575257285'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['contacts', 'accounts']) {
      await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS import_job_id uuid`)
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS ${table}_import_job_id_idx ON ${table} (workspace_id, import_job_id) WHERE import_job_id IS NOT NULL`,
      )
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['contacts', 'accounts']) {
      await queryRunner.query(`DROP INDEX IF EXISTS ${table}_import_job_id_idx`)
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS import_job_id`)
    }
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2009.14 — la clé d'idempotence ({@link
 * ProfileContextService.generationKey}) qui a produit la DERNIÈRE génération
 * RÉUSSIE de `profile_context`.
 *
 * Une colonne ADDITIVE, NULLABLE, sans CHECK : une ligne écrite avant ce lot
 * lit simplement `NULL` (jamais généré, ou dernière génération en échec —
 * les deux cas doivent régénérer normalement, jamais deviner une clé).
 */
export class ProfileContextGenerationKey1795999704207 implements MigrationInterface {
  name = 'ProfileContextGenerationKey1795999704207'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_context_generation_key text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE profiles DROP COLUMN IF EXISTS profile_context_generation_key;
    `)
  }
}

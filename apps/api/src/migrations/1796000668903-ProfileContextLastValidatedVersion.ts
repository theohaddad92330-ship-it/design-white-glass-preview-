import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2010.17 — le `profile_context_version` que portait `profiles` au moment du
 * clic « Valider », préservé au-delà d'une régénération qui écrase la ligne
 * en place. `profile_context_validated_at` (colonne existante) est remis à
 * `null` par chaque régénération (`ProfileContextRevisionService.snapshot`) —
 * cette colonne-ci survit exprès, pour retrouver QUELLE ancienne révision
 * (`profile_context_revisions`) était la dernière validée pendant qu'une
 * revue reste ouverte.
 *
 * ADDITIVE, NULLABLE, sans CHECK : une ligne écrite avant ce lot, ou jamais
 * validée, lit simplement `NULL` — jamais une version devinée.
 */
export class ProfileContextLastValidatedVersion1796000668903 implements MigrationInterface {
  name = 'ProfileContextLastValidatedVersion1796000668903'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_validated_context_version integer;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE profiles DROP COLUMN IF EXISTS last_validated_context_version;
    `)
  }
}

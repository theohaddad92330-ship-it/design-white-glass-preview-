import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2957 (#2180.39) — la référence de la consultation, pour la détection de
 * doublon par référence. Additive et NULLABLE : un dossier importé avant n'a
 * jamais eu sa référence extraite — `NULL` le dit, jamais une valeur devinée.
 */
export class RfpReference1796350506261 implements MigrationInterface {
  public name = 'RfpReference1796350506261'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rfps ADD COLUMN IF NOT EXISTS reference varchar(200);
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

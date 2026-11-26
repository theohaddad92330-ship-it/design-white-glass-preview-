import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Réseau personnel DÉCLARÉ à l'onboarding — #2045.1/.2/.4/.7 (lot B,
 * 22/09/2026).
 *
 * Quatre colonnes ADDITIVES, toutes NULLABLE : une question passée reste
 * NULL, jamais devinée à `0` ni remplie d'une valeur inventée. Même règle que
 * `1794210000000-VivierEtBaseClients.ts`, reprise à l'identique.
 */
export class ReseauPersonnelDeclare1795997843617 implements MigrationInterface {
  name = 'ReseauPersonnelDeclare1795997843617'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS former_clients_count_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS former_colleagues_count_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS partners_count_band text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS referrers_count_band text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS former_clients_count_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS former_colleagues_count_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS partners_count_band;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS referrers_count_band;
    `)
  }
}

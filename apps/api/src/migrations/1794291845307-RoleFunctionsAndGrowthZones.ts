import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2032.10 / #2036.9 — deux colonnes ADDITIVES sur `esn_profiles`.
 *
 * `role_functions_practiced` : les fonctions réellement EXERCÉES sur le
 * parcours, suivi de `user_role`. `growth_target_zones` : l'ambition
 * territoriale DÉCLARÉE, distincte de `geo_zones` — jamais fusionnées
 * (#2036.10, garde GA-338 : un champ déclaratif n'entre pas dans un chemin de
 * notation).
 *
 * Additive et idempotente, comme `1784819567318-ProfileQuestionnaire` : aucune
 * colonne existante n'est touchée, les deux nouvelles sont NOT NULL DEFAULT
 * '{}' (tableaux vides), le questionnaire ne bloque jamais.
 */
export class RoleFunctionsAndGrowthZones1794291845307 implements MigrationInterface {
  name = 'RoleFunctionsAndGrowthZones1794291845307'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS role_functions_practiced text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS growth_target_zones text[] NOT NULL DEFAULT '{}';
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS role_functions_practiced;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS growth_target_zones;
    `)
  }
}

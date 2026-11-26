import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2039.4 (épopée #2880, vague G lot g10, tranché sans Louis) — « partenaire » :
 * les expertises que l'ESN a déclarées (`expertise_areas`) et pour lesquelles
 * elle repose sur un partenaire. Même famille que `expertise_no_concrete_proof`
 * (migration `1796321384417`) et `expertise_client_reference` (migration
 * `1796322010437`) : une colonne ADDITIVE, `text[]` par défaut vide, le
 * questionnaire ne bloque jamais. Absente de `TEMPS1_REQUIRED_KEYS` : la
 * porte de complétion serveur ne bouge pas.
 *
 * Élargie AVANT le code qui l'écrit (GA-11/GA-12).
 */
export class ExpertisePartner1796322780330 implements MigrationInterface {
  name = 'ExpertisePartner1796322780330'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS expertise_partner text[] DEFAULT '{}';
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS expertise_partner;
    `)
  }
}

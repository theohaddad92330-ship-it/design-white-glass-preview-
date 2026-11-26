import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2039.2 (épopée #2880, tranché sans Louis) — « référence client » : les
 * expertises que l'ESN a déclarées (`expertise_areas`) et pour lesquelles
 * elle a une référence client réelle à montrer. Même famille que
 * `expertise_no_concrete_proof` (migration `1796321384417`) : une colonne
 * ADDITIVE, `text[]` par défaut vide, le questionnaire ne bloque jamais.
 * Absente de `TEMPS1_REQUIRED_KEYS` : la porte de complétion serveur ne
 * bouge pas.
 *
 * Élargie AVANT le code qui l'écrit (GA-11/GA-12).
 */
export class ExpertiseClientReference1796322010437 implements MigrationInterface {
  name = 'ExpertiseClientReference1796322010437'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS expertise_client_reference text[] DEFAULT '{}';
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS expertise_client_reference;
    `)
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Offre en types de prestation, secteurs référencés, crédibilité et modes de
 * réponse au besoin — lot 26 (#2038, #2039, #2040, #2041).
 *
 * Neuf colonnes ADDITIVES, toutes `text[]` par défaut vide, comme
 * `expertise_areas`/`target_sectors`/`offer_domains` : le questionnaire ne
 * bloque jamais, une question passée reste un tableau vide, jamais devinée.
 * Aucune n'est dans `TEMPS1_REQUIRED_KEYS` : la porte de complétion serveur
 * ne bouge pas.
 */
export class OffrePrestationsCredibilite1794010756001 implements MigrationInterface {
  name = 'OffrePrestationsCredibilite1794010756001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS service_types text[] DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS service_types_proven text[] DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS service_types_desired text[] DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS reference_sectors text[] DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS case_study_results text[] DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS client_testimonials text[] DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS staffing_modes text[] DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS profile_validation_methods text[] DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS contractual_constraints text[] DEFAULT '{}';
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS service_types;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS service_types_proven;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS service_types_desired;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS reference_sectors;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS case_study_results;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS client_testimonials;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS staffing_modes;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS profile_validation_methods;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS contractual_constraints;
    `)
  }
}

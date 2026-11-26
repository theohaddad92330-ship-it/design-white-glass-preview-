import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2035.2 — l'effectif de LA BU/agence de la personne qui répond, distinct du
 * total entreprise et du total groupe (`consultant_size_group_band`, #2035.1).
 *
 * Un libellé DÉCLARATIF (décision Louis 15/09, notée au registre #2035.2) :
 * cette colonne n'est PAS le module structurel `business_units` — voir
 * `apps/api/src/database/entities/business-unit.entity.ts`, le périmètre de
 * travail RÉEL d'un espace, qui porte ses propres `consultant_count` /
 * `team_size`. Les deux ne se synchronisent jamais : celle-ci enregistre ce
 * qu'UNE personne déclare au questionnaire, à SA date de réponse.
 *
 * Colonne ADDITIVE, NULLABLE : jamais devinée à `0`.
 */
export class EffectifBusinessUnitBand1795702847909 implements MigrationInterface {
  name = 'EffectifBusinessUnitBand1795702847909'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS consultant_size_business_unit_band text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS consultant_size_business_unit_band;
    `)
  }
}

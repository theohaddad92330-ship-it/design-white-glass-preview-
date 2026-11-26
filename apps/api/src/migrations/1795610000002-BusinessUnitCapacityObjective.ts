import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2005.5 (DÉCISION Louis 17/09/2026, lot CP2) — deux champs de BU, saisis par
 * le RESPONSABLE de la BU dans les réglages des périmètres :
 *  - `capacity_available_consultants` — consultants disponibles ;
 *  - `quarter_objective` — l'objectif du trimestre, texte libre.
 *
 * Colonnes ADDITIVES, NULLABLES sans CHECK, même règle que `consultant_count`
 * / `team_size` (voisines de cette même table) : `null` = « non renseigné »,
 * jamais `0` — « je n'ai pas dit » n'est pas « aucun consultant disponible ».
 */
export class BusinessUnitCapacityObjective1795610000002 implements MigrationInterface {
  name = 'BusinessUnitCapacityObjective1795610000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE business_units ADD COLUMN IF NOT EXISTS capacity_available_consultants integer;
    `)
    await queryRunner.query(`
      ALTER TABLE business_units ADD COLUMN IF NOT EXISTS quarter_objective text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE business_units DROP COLUMN IF EXISTS capacity_available_consultants;
    `)
    await queryRunner.query(`
      ALTER TABLE business_units DROP COLUMN IF EXISTS quarter_objective;
    `)
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Lot 791 — `market_person_paths.is_current` : « ce poste est-il tenu aujourd'hui ? » tel que le pack v2.1 le dit
 * (`positions.is_current_2024`), SANS fabriquer de date. Ajout seul : un booléen nullable (`NULL` = la source ne le
 * dit pas), donc aucune contrainte à élargir et aucune ligne existante réécrite.
 */
export class MarketPersonPathsIsCurrent1796900161651 implements MigrationInterface {
  public name = 'MarketPersonPathsIsCurrent1796900161651'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE market_person_paths ADD COLUMN IF NOT EXISTS is_current boolean`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE market_person_paths DROP COLUMN IF EXISTS is_current`)
  }
}

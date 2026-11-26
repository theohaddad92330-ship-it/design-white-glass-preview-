import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `user_favorites` accepte `'talent'` (écran Vivier, PDF-22 §01).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CONTRAINTE D'ABORD, LE CODE ENSUITE (GA-11 / GA-12)
 * ─────────────────────────────────────────────────────────────────────────────
 * `FAVORITE_ENTITY_TYPES` (`packages/contracts/src/schemas/favorites.ts`)
 * porte désormais `['contact', 'account', 'talent']` — `talent` EN FIN, comme
 * l'exige GA-08. Livrer le bouton signet du vivier AVANT cette migration
 * ferait échouer chaque pose de favori sur une violation de `CHECK`, avalée
 * par le service et lue « impossible de modifier ce favori » côté écran.
 *
 * Cette migration REPART de la dernière liste déclarée
 * (`1790300000003-UserFavorites`, `('contact', 'account')`), jamais d'une
 * liste plus ancienne — c'est ce que GA-11 vérifie.
 *
 * Aucune ligne existante n'est touchée : élargir une contrainte n'écrit rien.
 */
export class TalentFavorites1790973000002 implements MigrationInterface {
  public name = 'TalentFavorites1790973000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE user_favorites DROP CONSTRAINT IF EXISTS user_favorites_entity_type_check`)
    await queryRunner.query(`
      ALTER TABLE user_favorites ADD CONSTRAINT user_favorites_entity_type_check
        CHECK (entity_type IN ('contact', 'account', 'talent'))
    `)
  }

  /**
   * Reposer la liste PRÉCÉDENTE, pas en jeter une plus large : un `down()` qui
   * laisserait passer `'talent'` alors qu'on revient en arrière romprait
   * l'invariant que la migration suivante vérifiera à son tour.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE user_favorites DROP CONSTRAINT IF EXISTS user_favorites_entity_type_check`)
    await queryRunner.query(`
      ALTER TABLE user_favorites ADD CONSTRAINT user_favorites_entity_type_check
        CHECK (entity_type IN ('contact', 'account'))
    `)
  }
}

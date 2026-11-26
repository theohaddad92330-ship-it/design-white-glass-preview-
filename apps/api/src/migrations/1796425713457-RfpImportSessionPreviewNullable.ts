import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2957 (#2180.53) — recette prod 02/10 : « Analyser » puis rechargement ne
 * laissait RIEN à reprendre. La session n'était écrite qu'au RETOUR de
 * l'analyse (`preview NOT NULL`) ; recharger pendant le spinner perdait
 * l'import. La session se garde désormais dès « Analyser » : l'aperçu est
 * `NULL` tant que l'analyse n'a pas rendu (jamais un aperçu inventé).
 * Élargissement de contrainte, donc livré AVANT le code qui écrit `NULL`.
 */
export class RfpImportSessionPreviewNullable1796425713457 implements MigrationInterface {
  public name = 'RfpImportSessionPreviewNullable1796425713457'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE rfp_import_sessions ALTER COLUMN preview DROP NOT NULL`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM rfp_import_sessions WHERE preview IS NULL`)
    await queryRunner.query(`ALTER TABLE rfp_import_sessions ALTER COLUMN preview SET NOT NULL`)
  }
}

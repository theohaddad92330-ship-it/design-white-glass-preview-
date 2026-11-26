import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4336.1 — une affaire créée dans Bellum a TOUJOURS une origine : « saisie manuelle ».
 *
 * `createForWorkspace` écrivait `source = NULL` pour les affaires saisies à la main
 * (kind `manual`) ; la table et la carte du pipe affichaient alors une Origine vide
 * (recette production du 20/10 : 1 ligne sur 23). L'écriture dit désormais `manual` ;
 * ce rattrapage ne touche QUE les lignes `kind = 'manual'` sans source — jamais une
 * source déjà écrite, jamais une affaire issue d'une analyse.
 */
export class ProjectManualSourceBackfill1796570048729 implements MigrationInterface {
  name = 'ProjectManualSourceBackfill1796570048729'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE opportunities
         SET source = 'manual'
       WHERE kind = 'manual'
         AND (source IS NULL OR btrim(source) = '')
    `)
  }

  public async down(): Promise<void> {
    // Rattrapage de donnée : on ne ré-efface pas une origine.
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2127.37 — « Masquer cette suggestion » sur la carte « comptes similaires »
 * (dossier compte). QCM de Louis du 15/09/2026 : PERSISTANT, PAR PERSONNE,
 * archive jamais suppression.
 *
 * `dismissed_at` NULLABLE plutôt qu'une ligne par événement — voir le docblock
 * de `SimilarAccountDismissalEntity`. La clé primaire composite EST le scope
 * (workspace, personne, compte de référence, entreprise suggérée) : un même
 * couple ne peut être masqué deux fois, un ré-appel bascule la même ligne.
 */
export class SimilarAccountDismissals1789707821596 implements MigrationInterface {
  name = 'SimilarAccountDismissals1789707821596'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS similar_account_dismissals (
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        account_id uuid NOT NULL,
        candidate_siren text NOT NULL,
        dismissed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (workspace_id, user_id, account_id, candidate_siren)
      )
    `)
    // Sert le filtre de `listSimilarToAccount` : « les sirens masqués par CETTE
    // personne sur CE compte » — index PARTIEL, une ligne démasquée
    // (`dismissed_at IS NULL`) n'a pas à y figurer.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_similar_account_dismissals_active
        ON similar_account_dismissals (workspace_id, user_id, account_id)
        WHERE dismissed_at IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS similar_account_dismissals`)
  }
}

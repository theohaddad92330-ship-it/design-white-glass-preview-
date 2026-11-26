import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4290.16 — la carte d'un CRM disait « Synchronisé il y a 13 min » ET « Dernière synchro 19/10 » : `last_run_at`
 * est la date du dernier ESSAI (réussi ou non), l'autre était la date du registre. Pour n'afficher qu'UNE date — la
 * dernière synchro RÉUSSIE — il faut la garder à part.
 *
 * NULLABLE, additive. Rattrape l'existant : une ligne sans erreur a réussi à `last_run_at` ; une ligne en échec
 * n'a pas de date de réussite connue (jamais une date devinée).
 */
export class CrmSyncCursorLastSuccess1796570094748 implements MigrationInterface {
  name = 'CrmSyncCursorLastSuccess1796570094748'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE crm_sync_cursors ADD COLUMN IF NOT EXISTS last_success_at timestamptz`)
    await queryRunner.query(
      `UPDATE crm_sync_cursors SET last_success_at = last_run_at WHERE last_error IS NULL AND last_success_at IS NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE crm_sync_cursors DROP COLUMN IF EXISTS last_success_at`)
  }
}

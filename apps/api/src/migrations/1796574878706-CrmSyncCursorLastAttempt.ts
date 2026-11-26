import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4467 — quand chaque passe de synchro échoue, `last_run_at` garde la dernière réussite (18/10) et la carte
 * ne dit pas qu'un essai a eu lieu ce matin. On garde l'instant du dernier ESSAI à part.
 *
 * NULLABLE, additive. Rattrape l'existant : sans date d'essai connue, aucune date devinée (`NULL`).
 */
export class CrmSyncCursorLastAttempt1796574878706 implements MigrationInterface {
  name = 'CrmSyncCursorLastAttempt1796574878706'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE crm_sync_cursors ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE crm_sync_cursors DROP COLUMN IF EXISTS last_attempt_at`)
  }
}

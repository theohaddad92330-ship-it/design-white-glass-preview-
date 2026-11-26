import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Théo B M1.N1 / M1.N2 / M1.N3 / M1.N6 — l'état de traitement d'un fil, tenu côté Bellum.
 *
 * La contrainte sur `state` est ÉLARGIE ici, AVANT le code qui écrit `archived` (GA-11/12). Les valeurs déjà
 * écrites (`treated`, `irrelevant`, NULL) restent valides : ajout seulement. Trois colonnes neuves, toutes
 * facultatives : `snooze_until` (reporté jusqu'à, aucun rappel externe), `priority_manual` (priorité posée à la
 * main) et `contact_id` (contact rattaché à la main). Aucun contenu de message n'est stocké.
 */
export class MailThreadStateSnoozePriorityContact1796574800002 implements MigrationInterface {
  public name = 'MailThreadStateSnoozePriorityContact1796574800002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE mail_thread_marks DROP CONSTRAINT IF EXISTS mail_thread_marks_state_check`)
    await queryRunner.query(`
      ALTER TABLE mail_thread_marks
        ADD CONSTRAINT mail_thread_marks_state_check
        CHECK (state IS NULL OR state IN ('treated', 'irrelevant', 'archived'))
    `)
    await queryRunner.query(`ALTER TABLE mail_thread_marks ADD COLUMN IF NOT EXISTS snooze_until timestamptz`)
    await queryRunner.query(
      `ALTER TABLE mail_thread_marks ADD COLUMN IF NOT EXISTS priority_manual boolean NOT NULL DEFAULT false`,
    )
    await queryRunner.query(`ALTER TABLE mail_thread_marks ADD COLUMN IF NOT EXISTS contact_id uuid`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

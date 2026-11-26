import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4969 — `/settings/profile` disait « Échec — raison non enregistrée » : le statut `failed` s'écrivait sans motif.
 * Ajout seul, nullable : un échec antérieur n'a pas de raison, l'écran ne l'invente pas.
 */
export class ProfileContextFailureReason1796610035082 implements MigrationInterface {
  public name = 'ProfileContextFailureReason1796610035082'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_context_failure_reason text`)
  }

  public async down(): Promise<void> {
    // Ajout seul : la colonne reste.
  }
}

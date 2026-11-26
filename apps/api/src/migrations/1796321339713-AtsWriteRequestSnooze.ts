import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2856 — reste du lot précédent : le report (`snoozed_until`) couvrait
 * `approval_requests`, puis `outbound_write_requests` (migration
 * 1796321339689). Même colonne, même règle, posée ici pour
 * `ats_write_requests` (les écritures ERP en attente d'un responsable).
 *
 * La contrainte est posée AVANT le code qui écrit (GA-11/12), même CHECK que
 * les deux migrations précédentes : un report ne peut pas dépasser
 * `expires_at`.
 */
export class AtsWriteRequestSnooze1796321339713 implements MigrationInterface {
  name = 'AtsWriteRequestSnooze1796321339713'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE ats_write_requests ADD COLUMN IF NOT EXISTS snoozed_until timestamptz`)
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ats_write_requests_snooze_before_expiry') THEN
          ALTER TABLE ats_write_requests ADD CONSTRAINT ats_write_requests_snooze_before_expiry
            CHECK (snoozed_until IS NULL OR snoozed_until <= expires_at);
        END IF;
      END $$;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE ats_write_requests DROP CONSTRAINT IF EXISTS ats_write_requests_snooze_before_expiry`,
    )
    await queryRunner.query(`ALTER TABLE ats_write_requests DROP COLUMN IF EXISTS snoozed_until`)
  }
}

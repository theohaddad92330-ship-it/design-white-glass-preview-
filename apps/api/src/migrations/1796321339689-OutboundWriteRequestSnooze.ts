import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2856 — reste du lot précédent : le report (`snoozed_until`) ne couvrait
 * que `approval_requests` (migration 1796001543887). Même colonne, même
 * règle — une demande reportée reste `pending`, sort de la file active, et ne
 * peut pas dormir au-delà de son expiration — posée ici pour
 * `outbound_write_requests` (les écritures CRM en attente, BEL-INT-603).
 *
 * La contrainte est posée AVANT le code qui écrit (GA-11/12), même CHECK que
 * `approval_requests_snooze_before_expiry` : un report qui dépasserait
 * `expires_at` périrait endormi, sans que personne ne l'ait vu passer.
 */
export class OutboundWriteRequestSnooze1796321339689 implements MigrationInterface {
  name = 'OutboundWriteRequestSnooze1796321339689'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE outbound_write_requests ADD COLUMN IF NOT EXISTS snoozed_until timestamptz`)
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outbound_write_requests_snooze_before_expiry') THEN
          ALTER TABLE outbound_write_requests ADD CONSTRAINT outbound_write_requests_snooze_before_expiry
            CHECK (snoozed_until IS NULL OR snoozed_until <= expires_at);
        END IF;
      END $$;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE outbound_write_requests DROP CONSTRAINT IF EXISTS outbound_write_requests_snooze_before_expiry`,
    )
    await queryRunner.query(`ALTER TABLE outbound_write_requests DROP COLUMN IF EXISTS snoozed_until`)
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3915.1 (lot SIG-A, 12/10/2026) — le registre canonique garde enfin ce que
 * le `TriggerEvent` porte déjà : gravité, clé de dédup, expiration, statut.
 *
 * Ajout seulement (GA-11/12 : la colonne existe AVANT le code qui l'écrit).
 * La gravité est bornée 0-100 par le contrat Zod (`triggerEventSchema`), pas par SQL.
 * Toutes NULLABLES : les lignes déjà consignées restent valides, elles sont
 * lues « sans gravité, sans clé, sans échéance » — jamais inventées.
 */
export class CanonicalTriggerEventsKeepSeverityDedupeExpiryStatus1796458312847 implements MigrationInterface {
  public name = 'CanonicalTriggerEventsKeepSeverityDedupeExpiryStatus1796458312847'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE canonical_trigger_events ADD COLUMN IF NOT EXISTS severity integer`)
    await queryRunner.query(`ALTER TABLE canonical_trigger_events ADD COLUMN IF NOT EXISTS dedupe_key text`)
    await queryRunner.query(`ALTER TABLE canonical_trigger_events ADD COLUMN IF NOT EXISTS expires_at timestamptz`)
    await queryRunner.query(`ALTER TABLE canonical_trigger_events ADD COLUMN IF NOT EXISTS status text`)
    await queryRunner.query(`
      ALTER TABLE canonical_trigger_events
      DROP CONSTRAINT IF EXISTS canonical_trigger_events_status_check
    `)
    await queryRunner.query(`
      ALTER TABLE canonical_trigger_events
      ADD CONSTRAINT canonical_trigger_events_status_check
      CHECK (status IS NULL OR status IN ('open', 'acknowledged', 'resolved'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE canonical_trigger_events DROP CONSTRAINT IF EXISTS canonical_trigger_events_status_check`,
    )
    await queryRunner.query(`ALTER TABLE canonical_trigger_events DROP COLUMN IF EXISTS status`)
    await queryRunner.query(`ALTER TABLE canonical_trigger_events DROP COLUMN IF EXISTS expires_at`)
    await queryRunner.query(`ALTER TABLE canonical_trigger_events DROP COLUMN IF EXISTS dedupe_key`)
    await queryRunner.query(`ALTER TABLE canonical_trigger_events DROP COLUMN IF EXISTS severity`)
  }
}

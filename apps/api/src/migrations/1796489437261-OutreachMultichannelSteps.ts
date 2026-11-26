import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Lot L-B (#4165, épopée #4163) — séquences MULTICANAL.
 *
 *  1. `outreach_sequence_steps.kind` accepte `linkedin_invite`, `linkedin_message`
 *     et `call` en plus de `email`, `reminder`, `task`. La contrainte était
 *     déclarée EN LIGNE (nom attribué par Postgres) : on la retire par ce nom
 *     et on la repose NOMMÉE. Elle est élargie AVANT le code qui écrit ces
 *     valeurs (GA-11/GA-12) — un CHECK invisible aux specs mockées a déjà cassé
 *     la démo le 11/10.
 *  2. `outreach_sequences.delay_unit` : `business_days` | `calendar_days`.
 *     DÉFAUT SQL `calendar_days` : toute séquence EXISTANTE garde son comptage
 *     (aucun changement silencieux). C'est le code de création qui écrit
 *     `business_days` pour une séquence NEUVE.
 *  3. `vacation_paused_at` / `vacation_until` : la pause vacances. NULLABLES —
 *     une pause manuelle ou automatique ne porte jamais de date de reprise.
 *
 * Additive : rien n'est retiré, aucune ligne réécrite.
 */
export class OutreachMultichannelSteps1796489437261 implements MigrationInterface {
  name = 'OutreachMultichannelSteps1796489437261'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE outreach_sequence_steps DROP CONSTRAINT IF EXISTS outreach_sequence_steps_kind_check`,
    )
    await queryRunner.query(`
      ALTER TABLE outreach_sequence_steps ADD CONSTRAINT outreach_sequence_steps_kind_check
        CHECK (kind IN ('email', 'reminder', 'task', 'linkedin_invite', 'linkedin_message', 'call'))
    `)
    await queryRunner.query(`
      ALTER TABLE outreach_sequences ADD COLUMN IF NOT EXISTS delay_unit text NOT NULL DEFAULT 'calendar_days'
    `)
    await queryRunner.query(
      `ALTER TABLE outreach_sequences DROP CONSTRAINT IF EXISTS outreach_sequences_delay_unit_check`,
    )
    await queryRunner.query(`
      ALTER TABLE outreach_sequences ADD CONSTRAINT outreach_sequences_delay_unit_check
        CHECK (delay_unit IN ('business_days', 'calendar_days'))
    `)
    await queryRunner.query(`ALTER TABLE outreach_sequences ADD COLUMN IF NOT EXISTS vacation_paused_at timestamptz`)
    await queryRunner.query(`ALTER TABLE outreach_sequences ADD COLUMN IF NOT EXISTS vacation_until timestamptz`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE outreach_sequences DROP COLUMN IF EXISTS vacation_until`)
    await queryRunner.query(`ALTER TABLE outreach_sequences DROP COLUMN IF EXISTS vacation_paused_at`)
    await queryRunner.query(
      `ALTER TABLE outreach_sequences DROP CONSTRAINT IF EXISTS outreach_sequences_delay_unit_check`,
    )
    await queryRunner.query(`ALTER TABLE outreach_sequences DROP COLUMN IF EXISTS delay_unit`)
    await queryRunner.query(
      `UPDATE outreach_sequence_steps SET kind = 'task' WHERE kind IN ('linkedin_invite', 'linkedin_message', 'call')`,
    )
    await queryRunner.query(
      `ALTER TABLE outreach_sequence_steps DROP CONSTRAINT IF EXISTS outreach_sequence_steps_kind_check`,
    )
    await queryRunner.query(`
      ALTER TABLE outreach_sequence_steps ADD CONSTRAINT outreach_sequence_steps_kind_check
        CHECK (kind IN ('email', 'reminder', 'task'))
    `)
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Add ``contacts.career_levers`` and ``contacts.implicit_fears`` (jsonb text
 * arrays).
 *
 * Phase-3 already produces these decider-psychology fields (deck / ORION —
 * career levers to orient the pitch, implicit organisational fears to defuse)
 * but they were dropped on persist: no column held them, so the dossier never
 * showed them and the /contract page listed them as "⏳ P2 — pas encore
 * persisté". They now land on the top-N enriched deciders; NULL for the tail.
 */
export class AddContactDeciderPsychology1782600000000 implements MigrationInterface {
  public name = 'AddContactDeciderPsychology1782600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS career_levers jsonb`)
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS implicit_fears jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS career_levers`)
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS implicit_fears`)
  }
}

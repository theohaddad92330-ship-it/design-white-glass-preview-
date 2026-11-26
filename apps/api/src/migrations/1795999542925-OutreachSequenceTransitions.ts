import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2381 (LAU-FINAL-095) — `outreach_transitions` (#2366.8) apprend un
 * troisième SUJET : `sequence`. Une séquence arrêtée (dix-sept événements,
 * `OUTREACH_SEQUENCE_STOP_EVENTS`) ou mise en pause (huit événements,
 * `OUTREACH_SEQUENCE_PAUSE_EVENTS`) s'y journalise avec sa CAUSE — le MÊME
 * journal append-only que les messages et les appels, pas un second (GA-26).
 *
 * La contrainte CHECK est élargie AVANT le code qui écrit `subject_kind =
 * 'sequence'` (GA-11/GA-12) — `outreach-canonical.ts` a déjà ajouté
 * `'sequence'` à `OUTREACH_TRANSITION_SUBJECTS`.
 */
export class OutreachSequenceTransitions1795999542925 implements MigrationInterface {
  public name = 'OutreachSequenceTransitions1795999542925'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE outreach_transitions DROP CONSTRAINT IF EXISTS outreach_transitions_subject_kind_check`,
    )
    await queryRunner.query(`
      ALTER TABLE outreach_transitions ADD CONSTRAINT outreach_transitions_subject_kind_check
      CHECK (subject_kind IN ('message', 'call_task', 'sequence'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE outreach_transitions DROP CONSTRAINT IF EXISTS outreach_transitions_subject_kind_check`,
    )
    await queryRunner.query(`
      ALTER TABLE outreach_transitions ADD CONSTRAINT outreach_transitions_subject_kind_check
      CHECK (subject_kind IN ('message', 'call_task'))
    `)
  }
}

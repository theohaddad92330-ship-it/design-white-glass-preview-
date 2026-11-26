import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2909 (#2378.2) — le déclencheur par ouverture/clic, en version DÉCLARATIVE
 * (voir `OUTREACH_ENGAGEMENT_SIGNALS`, `outreach-sequence.ts` : aucun pixel ni
 * lien réécrit n'est honnête ici, l'envoi ne traverse jamais Bellum). Le
 * commercial rapporte ce qu'il a constaté dans sa propre messagerie — même
 * famille que « Fait » (c81) : un geste déclaratif, jamais une preuve.
 *
 * Contrainte élargie AVANT le code qui écrit (GA-11/GA-12), NULLABLE sans
 * défaut : une étape déjà en base reste sans signal tant que personne ne le
 * rapporte.
 */
export class OutreachStepEngagementSignal1796321999085 implements MigrationInterface {
  public name = 'OutreachStepEngagementSignal1796321999085'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE outreach_sequence_steps ADD COLUMN IF NOT EXISTS engagement_signal TEXT`)
    await queryRunner.query(
      `ALTER TABLE outreach_sequence_steps ADD COLUMN IF NOT EXISTS engagement_signal_at TIMESTAMPTZ`,
    )
    await queryRunner.query(
      `ALTER TABLE outreach_sequence_steps DROP CONSTRAINT IF EXISTS outreach_sequence_steps_engagement_signal_check`,
    )
    await queryRunner.query(
      `ALTER TABLE outreach_sequence_steps ADD CONSTRAINT outreach_sequence_steps_engagement_signal_check
         CHECK (engagement_signal IS NULL OR engagement_signal IN ('opened', 'clicked'))`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Épopée #2873 (#2367.14, LOT c5 clôture 26/09) — la routine
 * `sequence_completed_crm_update` a besoin de savoir QUAND une séquence est
 * passée `completed` pour ne signaler que les récentes ; `outreach_sequences`
 * ne portait jusqu'ici que `created_at`. Additive, nullable, aucun défaut
 * deviné : une séquence déjà `completed` avant cette migration n'a jamais eu
 * de date de complétion observée — `NULL` le dit, jamais une date fabriquée
 * (doctrine « jamais de donnée fictive »). `OutreachService.stepDone` la pose
 * désormais au moment réel du passage à `completed`.
 */
export class OutreachSequenceCompletedAt1796321999879 implements MigrationInterface {
  public name = 'OutreachSequenceCompletedAt1796321999879'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outreach_sequences
        ADD COLUMN IF NOT EXISTS completed_at timestamptz
    `)
    // La routine filtre « complétée récemment » — cet index sert cette
    // sélection sans scanner les séquences actives/annulées/pausées.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_outreach_sequences_completed_at
        ON outreach_sequences (completed_at)
        WHERE completed_at IS NOT NULL
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

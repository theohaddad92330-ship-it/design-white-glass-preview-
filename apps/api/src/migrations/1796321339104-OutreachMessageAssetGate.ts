import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2372.6 (épopée #2838, suite du 25/09/2026) — le GATE d'envoi conditionnel,
 * enfin appliqué. `outreach_assets.usage_rights` NOMMAIT déjà la règle
 * (`1796321264768-OutreachAssets`) ; aucun appelant ne la lisait. Un message
 * préparé (`outreach_messages`, `1795999204817-OutreachCanonicalModel`) peut
 * désormais joindre un asset du catalogue — la colonne est posée AVANT le
 * code qui l'écrit (GA-11/GA-12), `OutreachMessageEntity` et
 * `createOutreachMessageRequestSchema` ont déjà `asset_id`.
 *
 * `ON DELETE SET NULL` : un asset retiré du catalogue ne doit pas emporter le
 * message déjà préparé — même geste que `sequence_id`/`sequence_step_id` sur
 * cette même table.
 */
export class OutreachMessageAssetGate1796321339104 implements MigrationInterface {
  public name = 'OutreachMessageAssetGate1796321339104'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outreach_messages
        ADD COLUMN IF NOT EXISTS outreach_asset_id uuid REFERENCES outreach_assets(id) ON DELETE SET NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_outreach_messages_asset ON outreach_messages (outreach_asset_id)
        WHERE outreach_asset_id IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ix_outreach_messages_asset`)
    await queryRunner.query(`ALTER TABLE outreach_messages DROP COLUMN IF EXISTS outreach_asset_id`)
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Enriches `beta_feedback` with what the in-app bug reporter now captures:
 * the DOM element the user pointed at (source location stamped at build time,
 * React component stack, selector, geometry) and the recent runtime failures
 * (uncaught errors, rejections, non-2xx API calls). Both are nullable so old
 * rows and reports sent without pointing at anything stay valid.
 */
export class FeedbackElementContext1786300000000 implements MigrationInterface {
  public name = 'FeedbackElementContext1786300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE beta_feedback ADD COLUMN IF NOT EXISTS element_context JSONB`)
    await queryRunner.query(`ALTER TABLE beta_feedback ADD COLUMN IF NOT EXISTS error_logs TEXT`)
    await queryRunner.query(`ALTER TABLE beta_feedback ADD COLUMN IF NOT EXISTS screenshot_url TEXT`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

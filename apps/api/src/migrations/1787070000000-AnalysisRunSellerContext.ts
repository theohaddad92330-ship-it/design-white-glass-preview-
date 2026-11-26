import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Per-run snapshot of the ESN seller profile that conditioned the analysis
 * (Théo restitution P0-08 — reproductibilité).
 *
 * The analysis is tailored by the seller's ESN profile (`profileData` =
 * `esnAnswersToProfileData(answers)`). Until now a resume/replay re-derived the
 * CURRENT profile (`analysis.service.ts` `resolveProfileData`), so a profile
 * edited between the original run and a resume silently changed the resumed
 * phases' inputs — the run was not reproducible.
 *
 * `analysis_runs` is the right anchor: append-only, one immutable row per run,
 * timestamped. The column stores the exact `profileData` used at launch, so a
 * resume can replay the ORIGINAL inputs.
 *
 * Additive, nullable, idempotent. NULL = run older than the column (or a launch
 * whose profile couldn't be captured) → resume falls back to the current
 * profile, i.e. the previous behaviour.
 */
export class AnalysisRunSellerContext1787070000000 implements MigrationInterface {
  public name = 'AnalysisRunSellerContext1787070000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS seller_context jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE analysis_runs DROP COLUMN IF EXISTS seller_context`)
  }
}

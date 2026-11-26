import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4426.7 — les SCRIPTS D'APPEL d'une campagne importée (« Script : Accroche », « Le Liant »…) se rangent avec le
 * modèle : une colonne `kind` sur ses étapes. Ajout seul — `email` (défaut) est le comportement d'avant, tout
 * modèle existant reste lu à l'identique. La contrainte est posée AVANT le code qui écrit `call_script` (GA-11/12).
 */
export class SequenceTemplateStepKind1796570155559 implements MigrationInterface {
  public name = 'SequenceTemplateStepKind1796570155559'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE sequence_template_steps ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'email'`,
    )
    await queryRunner.query(
      `ALTER TABLE sequence_template_steps DROP CONSTRAINT IF EXISTS sequence_template_steps_kind_check`,
    )
    await queryRunner.query(
      `ALTER TABLE sequence_template_steps ADD CONSTRAINT sequence_template_steps_kind_check CHECK (kind IN ('email', 'call_script'))`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE sequence_template_steps DROP CONSTRAINT IF EXISTS sequence_template_steps_kind_check`,
    )
    await queryRunner.query(`ALTER TABLE sequence_template_steps DROP COLUMN IF EXISTS kind`)
  }
}

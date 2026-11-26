import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2424.3 — REX interne : trois des quinze champs nommés (équipe,
 * compétences, contraintes), tranche livrée. **Tranché sans Louis (doctrine
 * §3c)** faute de la liste exacte du document source, comme
 * `ProofExternalReferenceFields1796000497241` avant : les douze autres champs
 * nommés (dont le feedback client/consultant SÉPARÉ) restent à trancher.
 *
 * Additive uniquement (GA-11 / GA-12).
 */
export class RexEntryTeamSkillsConstraints1796000720682 implements MigrationInterface {
  name = 'RexEntryTeamSkillsConstraints1796000720682'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE rex_entries ADD COLUMN IF NOT EXISTS team text`)
    await queryRunner.query(`ALTER TABLE rex_entries ADD COLUMN IF NOT EXISTS skills text`)
    await queryRunner.query(`ALTER TABLE rex_entries ADD COLUMN IF NOT EXISTS constraints text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE rex_entries DROP COLUMN IF EXISTS constraints`)
    await queryRunner.query(`ALTER TABLE rex_entries DROP COLUMN IF EXISTS skills`)
    await queryRunner.query(`ALTER TABLE rex_entries DROP COLUMN IF EXISTS team`)
  }
}

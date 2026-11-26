import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3210.2 (épopée #3246, reste de #2424.3) — sept des douze champs d'un cas
 * validé qui manquaient encore à `rex_entries` : offre, expertise, voie
 * d'accès, première porte, preuve mobilisée, durée du cycle, partenaire.
 *
 * `RexEntryTeamSkillsConstraints1796000720682` avait livré trois des quinze
 * champs nommés à l'origine et laissé les douze autres « à trancher avec la
 * liste réelle du document source » : cette liste est maintenant connue
 * (#3210, LAU-FINAL-216) — sept de ces douze sont directement des CHAMPS DE
 * TEXTE saisis par l'humain, comme `team`/`skills`/`constraints`. Les cinq
 * restants (résultat, raisons de succès/échec, limites de transférabilité,
 * type d'entreprise) ne sont pas dans ce lot.
 *
 * Additive uniquement (GA-11 / GA-12).
 */
export class RexEntryRemainingCaseFields1796376381174 implements MigrationInterface {
  name = 'RexEntryRemainingCaseFields1796376381174'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE rex_entries ADD COLUMN IF NOT EXISTS offer text`)
    await queryRunner.query(`ALTER TABLE rex_entries ADD COLUMN IF NOT EXISTS expertise text`)
    await queryRunner.query(`ALTER TABLE rex_entries ADD COLUMN IF NOT EXISTS access_path text`)
    await queryRunner.query(`ALTER TABLE rex_entries ADD COLUMN IF NOT EXISTS first_door text`)
    await queryRunner.query(`ALTER TABLE rex_entries ADD COLUMN IF NOT EXISTS proof_used text`)
    await queryRunner.query(`ALTER TABLE rex_entries ADD COLUMN IF NOT EXISTS cycle_duration text`)
    await queryRunner.query(`ALTER TABLE rex_entries ADD COLUMN IF NOT EXISTS partner text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE rex_entries DROP COLUMN IF EXISTS partner`)
    await queryRunner.query(`ALTER TABLE rex_entries DROP COLUMN IF EXISTS cycle_duration`)
    await queryRunner.query(`ALTER TABLE rex_entries DROP COLUMN IF EXISTS proof_used`)
    await queryRunner.query(`ALTER TABLE rex_entries DROP COLUMN IF EXISTS first_door`)
    await queryRunner.query(`ALTER TABLE rex_entries DROP COLUMN IF EXISTS access_path`)
    await queryRunner.query(`ALTER TABLE rex_entries DROP COLUMN IF EXISTS expertise`)
    await queryRunner.query(`ALTER TABLE rex_entries DROP COLUMN IF EXISTS offer`)
  }
}

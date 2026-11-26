import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2015.7 (dire si c'est un groupe ou une filiale), #2056.11 (l'économie du
 * dossier) et #2057.10 (l'owner) — voir
 * `.claude/notes/registre-2026-09-15-onboarding-questionnaire.md`, lignes
 * `| 2015.7 |`, `| 2056.11 |` et `| 2057.10 |`.
 *
 * Additive et idempotente : aucune colonne existante n'est touchée, aucune
 * valeur n'est écrite. Les trois colonnes sont NULLABLE (le questionnaire ne
 * bloque jamais) — même convention que `RfpAndContentQuestions1794300000001`.
 */
export class QuestionnaireFiliationOwnerEconomie1795300384517 implements MigrationInterface {
  name = 'QuestionnaireFiliationOwnerEconomie1795300384517'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS company_group_structure text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS rfp_deal_value text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS rfp_owner_assignment text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS company_group_structure;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS rfp_deal_value;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS rfp_owner_assignment;
    `)
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2399.6 / #2399.7 (épopée #2843) — une bascule de version MONTRE avant de basculer, et GARDE l'ancienne version.
 *
 * `automation_rules` gagne deux colonnes, additives (aucune ligne n'est réécrite, le comportement des règles existantes est
 * inchangé) :
 *  - `draft_compared_at` : le moment où la comparaison a été rendue pour le brouillon courant ; la bascule l'exige ;
 *  - `version_history` : les versions qui ont tourné avant celle-ci (jsonb, `[]` par défaut). On archive, on ne supprime pas.
 * Aucune contrainte à élargir : le jsonb ne porte que des champs déjà couverts par les CHECK de la table.
 */
export class AutomationRuleVersionHistory1796575200123 implements MigrationInterface {
  public name = 'AutomationRuleVersionHistory1796575200123'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE automation_rules
        ADD COLUMN IF NOT EXISTS draft_compared_at timestamptz,
        ADD COLUMN IF NOT EXISTS version_history jsonb NOT NULL DEFAULT '[]'::jsonb
    `)
    await queryRunner.query(`
      ALTER TABLE automation_rules ADD CONSTRAINT automation_rules_version_history_check
        CHECK (jsonb_typeof(version_history) = 'array')
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

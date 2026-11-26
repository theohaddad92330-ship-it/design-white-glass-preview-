import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2396.1/.2/.5 — une action du plan complétée à la main enregistre son ISSUE,
 * et chaque action complétée sait dire COMMENT elle l'a été.
 *
 * Recette du 22/09 : `useCompleteRelance` / `ActionExecuteMenu` marquaient
 * « fait » sans rien demander — result_note existait sur `tasks` (un système
 * voisin) mais jamais renseigné, et aucune notion de mode de complétion
 * n'existait nulle part.
 *
 * Deux colonnes, toutes deux NULLABLES SANS défaut : une ligne non complétée,
 * ou complétée avant cette règle, n'a ni l'une ni l'autre — un défaut aurait
 * fabriqué une issue ou un mode inventés (GA-18/GA-19).
 */
export class ActionPlanItemOutcome1795999493771 implements MigrationInterface {
  public name = 'ActionPlanItemOutcome1795999493771'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE action_plan_items ADD COLUMN outcome text NULL`)
    await queryRunner.query(
      `ALTER TABLE action_plan_items ADD CONSTRAINT action_plan_items_outcome_check
         CHECK (outcome IN ('positive', 'declined', 'deferred', 'qualified', 'no_response'))`,
    )
    await queryRunner.query(`ALTER TABLE action_plan_items ADD COLUMN completion_mode text NULL`)
    await queryRunner.query(
      `ALTER TABLE action_plan_items ADD CONSTRAINT action_plan_items_completion_mode_check
         CHECK (completion_mode IN ('manual', 'proof', 'event', 'proposed'))`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

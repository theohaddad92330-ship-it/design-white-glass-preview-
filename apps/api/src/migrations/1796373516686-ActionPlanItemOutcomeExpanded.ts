import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3265.3 (BEL-SC-236, P0) — LES QUINZE ISSUES CANONIQUES DU §OUTCOMES.
 *
 * `action_plan_items_outcome_check` (migration `1795999493771`) ne couvrait
 * que 5 valeurs génériques. Le corps de l'issue #3265 (§OUTCOMES) en liste 15
 * de plus, dont la distinction entre une réorientation obtenue
 * (`orientation_given`) et un simple silence (`no_response`) que le §LAURA de
 * l'issue prend pour exemple. `ACTION_PLAN_OUTCOMES`
 * (`packages/contracts/src/schemas/action-plan-items.ts`) a été élargi en
 * conséquence — GA-08 : les 5 valeurs d'origine restent, dans le même ordre,
 * les 15 nouvelles vont en fin.
 *
 * GA-11/GA-12 : la contrainte SQL s'élargit ici, AVANT qu'un code n'écrive
 * une des 15 valeurs neuves. Additive seulement — aucune des 5 valeurs
 * historiques ne disparaît, une ligne déjà écrite reste valide.
 */
export class ActionPlanItemOutcomeExpanded1796373516686 implements MigrationInterface {
  public name = 'ActionPlanItemOutcomeExpanded1796373516686'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE action_plan_items DROP CONSTRAINT IF EXISTS action_plan_items_outcome_check`)
    await queryRunner.query(`
      ALTER TABLE action_plan_items ADD CONSTRAINT action_plan_items_outcome_check
        CHECK (outcome IN (
          'positive', 'declined', 'deferred', 'qualified', 'no_response',
          'information_obtained', 'connected_qualified', 'wrong_contact', 'orientation_given',
          'need_confirmed', 'need_not_confirmed', 'callback_scheduled', 'not_now', 'refused',
          'no_answer', 'invalid_contact', 'left_company', 'meeting_booked', 'action_cancelled', 'other'
        ))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

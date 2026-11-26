import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3416.1 (beta-feedback, lot C14 30/09/2026) — QUATRE issues manquantes au
 * §OUTCOMES : un blocage ACHATS et un blocage MARGE (une contrainte ferme la
 * route, pas un refus humain — `declined`/`refused` mentiraient sur qui a dit
 * non), une ERREUR TECHNIQUE (jusqu'ici écrasée sous `other`, qui ne
 * distingue plus rien) et un ABANDON (distinct de `declined` — un refus REÇU
 * — et d'`action_cancelled` — un retrait avant tentative).
 *
 * `action_plan_items_outcome_check` (migration `1796373516686`) ne couvrait
 * que les vingt valeurs précédentes. `ACTION_PLAN_OUTCOMES`
 * (`packages/contracts/src/schemas/action-plan-items.ts`) est élargi en
 * conséquence — GA-08 : les vingt valeurs restent, dans le même ordre, les
 * quatre nouvelles vont en fin.
 *
 * GA-11/GA-12 : la contrainte SQL s'élargit ici, AVANT qu'un code n'écrive
 * une des quatre valeurs neuves. Additive seulement — aucune des vingt
 * valeurs historiques ne disparaît, une ligne déjà écrite reste valide.
 */
export class ActionPlanItemOutcomeBlockers1796409441337 implements MigrationInterface {
  public name = 'ActionPlanItemOutcomeBlockers1796409441337'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE action_plan_items DROP CONSTRAINT IF EXISTS action_plan_items_outcome_check`)
    await queryRunner.query(`
      ALTER TABLE action_plan_items ADD CONSTRAINT action_plan_items_outcome_check
        CHECK (outcome IN (
          'positive', 'declined', 'deferred', 'qualified', 'no_response',
          'information_obtained', 'connected_qualified', 'wrong_contact', 'orientation_given',
          'need_confirmed', 'need_not_confirmed', 'callback_scheduled', 'not_now', 'refused',
          'no_answer', 'invalid_contact', 'left_company', 'meeting_booked', 'action_cancelled', 'other',
          'blocked_by_procurement', 'blocked_by_margin', 'technical_error', 'abandoned'
        ))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

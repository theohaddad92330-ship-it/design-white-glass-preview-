import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Élargit le CHECK de `user_actions.action_type` à `crm_task_created` —
 * trouvé en préparant le rollback `remove_crm_task` (épopée #2771, #2277.36).
 *
 * `ActionRouterService.dispatchCrmTask` journalise sous ce type depuis le
 * lot #1931 (`create_crm_task`) sans que le CHECK SQL ne l'ait jamais
 * autorisé : chaque écriture était rejetée par Postgres et avalée en silence
 * par le `catch` best-effort de `journal()` (même risque documenté par
 * `CommercialStatusChangedActionType`, GA-11/12 — une valeur qui voyage du
 * code vers la base voit sa contrainte élargie AVANT le code qui l'écrit,
 * jamais après). Conséquence concrète : aucune tâche CRM créée depuis le
 * routeur d'actions n'a jamais laissé de trace au Journal d'activité, et
 * `remove_crm_task` n'aurait donc jamais eu de ligne à retirer.
 *
 * Additif + idempotent (drop-then-add), aucune valeur retirée (GA-08), valeur
 * ajoutée en FIN de liste.
 */
export class CrmTaskCreatedActionType1796321339217 implements MigrationInterface {
  public name = 'CrmTaskCreatedActionType1796321339217'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const list = USER_ACTION_TYPES.map(type => `'${type}'`).join(',')
    await queryRunner.query(`ALTER TABLE user_actions DROP CONSTRAINT IF EXISTS user_actions_action_type_check`)
    await queryRunner.query(
      `ALTER TABLE user_actions ADD CONSTRAINT user_actions_action_type_check CHECK (action_type IN (${list}))`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

/** L'ensemble COMPLET autorisé = celui de `CommercialStatusChangedActionType`
 *  (1793700310000) + `crm_task_created`. À garder synchronisé avec
 *  `actionTypeSchema` de `@bellum/contracts` — la spec de cette migration le
 *  vérifie valeur par valeur. */
const USER_ACTION_TYPES = [
  'message_copied',
  'message_sent',
  'response_received',
  'rdv_obtained',
  'deal_signed',
  'analysis_started',
  'analysis_completed',
  'export',
  'plan_action_added',
  'plan_action_completed',
  'plan_action_uncompleted',
  'plan_action_skipped',
  'plan_action_rescheduled',
  'plan_action_opened',
  'plan_action_contact_opened',
  'plan_action_message_generated',
  'plan_action_message_copied',
  'plan_action_message_sent',
  'plan_action_call_prepared',
  'plan_action_call_logged',
  'plan_action_linkedin_opened',
  'plan_action_enrichment_requested',
  'plan_action_assigned',
  'account_score_changed',
  'profile_updated',
  'need_play_generated',
  'commercial_status_changed',
  'crm_task_created',
]

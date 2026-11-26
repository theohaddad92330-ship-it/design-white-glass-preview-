import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Élargit le CHECK de `user_actions.action_type` à `need_play_generated` — la
 * trace du plan d'attaque d'un besoin.
 *
 * Le plan DÉBITE un crédit et n'écrivait aucune ligne au journal d'activité (vu
 * en production le 04/08 : un plan préparé restait invisible pendant que
 * l'enrichissement du même après-midi y figurait). Le service écrit désormais
 * la trace — mais une valeur qui voyage du code vers la base doit voir sa
 * contrainte élargie AVANT le code qui l'écrit, sinon Postgres rejette
 * l'insertion. Comme l'écriture est best-effort (elle ne doit jamais faire
 * échouer un plan déjà rendu au client), le rejet aurait été avalé par le
 * `catch` : le journal serait resté vide, sans erreur, exactement comme avant.
 * C'est le piège déjà rencontré sur `account_vocabulary.kind` et
 * `contacts_source_check`.
 *
 * Additif + idempotent (drop-then-add). RLS inchangée.
 */
export class NeedPlayActionType1788912847316 implements MigrationInterface {
  public name = 'NeedPlayActionType1788912847316'

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

/** L'ensemble COMPLET autorisé = celui de `HistorySinceLastSeen`
 *  (1788051327419) + la trace du plan d'attaque. À garder synchronisé avec
 *  `actionTypeSchema` de `@bellum/contracts` — un test le vérifie valeur par
 *  valeur, et c'est LUI qui a rattrapé l'oubli initial. */
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
]

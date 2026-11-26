import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * §8 « Historique » (restitution V2) — deux briques additives :
 *
 *  1. Deux nouveaux `action_type` SYSTÈME dans le CHECK de `user_actions` :
 *     `account_score_changed` (le score de priorité d'un compte a bougé à la
 *     complétion d'une (ré)analyse) et `profile_updated` (le profil ESN a été
 *     modifié). Jusqu'ici l'historique ne traçait qu'analyses / enrichissements
 *     / exports / messages / équipe / intégrations — jamais un changement de
 *     score ni de profil.
 *
 *  2. `user_last_seen` — le repère « depuis ma dernière connexion ». Un SNAPSHOT
 *     par utilisateur, posé au sign-in (pas un heartbeat réécrit à chaque
 *     requête, ce qui viderait toujours la fenêtre) : `last_seen_at` = début de
 *     la session courante, `previous_seen_at` = début de la session PRÉCÉDENTE,
 *     le repère stable que lit le mode « delta » du Journal.
 *
 * Additif + idempotent (drop-then-add du CHECK, CREATE TABLE IF NOT EXISTS). RLS
 * inchangée. Migration détenue par NestJS (owner des tables métier).
 */
export class HistorySinceLastSeen1788051327419 implements MigrationInterface {
  public name = 'HistorySinceLastSeen1788051327419'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const list = USER_ACTION_TYPES.map(type => `'${type}'`).join(',')
    await queryRunner.query(`ALTER TABLE user_actions DROP CONSTRAINT IF EXISTS user_actions_action_type_check`)
    await queryRunner.query(
      `ALTER TABLE user_actions ADD CONSTRAINT user_actions_action_type_check CHECK (action_type IN (${list}))`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_last_seen (
        user_id uuid PRIMARY KEY,
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        previous_seen_at timestamptz NULL
      )
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

/** Full allowed `user_actions.action_type` set = previous set (`UserActionExport`
 *  1785600200000) + the two §8 system events. Keep in sync with
 *  `actionTypeSchema` in `@bellum/contracts`. */
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
]

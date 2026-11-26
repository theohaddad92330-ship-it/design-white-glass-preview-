import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2117.24 — élargit le CHECK de `user_actions.action_type` à
 * `commercial_status_changed` : la trace de CHAQUE changement de statut
 * commercial (qui, de → vers, motif).
 *
 * Seul le passage en client en écrivait une (`deal_signed`). Recette du
 * 15/09/2026 en production : l'info-bulle du statut disait, à juste titre,
 * « l'historique complet des changements n'est pas encore journalisé ». Le
 * service écrit désormais l'entrée — mais une valeur qui voyage du code vers
 * la base voit sa contrainte élargie AVANT le code qui l'écrit (GA-11/12) :
 * l'écriture est best-effort, un rejet Postgres serait avalé par le `catch` et
 * le journal resterait vide sans erreur.
 *
 * Le MOTIF (#2117.23) voyage dans `metadata` (jsonb) : il appartient à la
 * transition, pas au statut — une colonne sur `accounts` ne garderait que le
 * dernier et effacerait les précédents.
 *
 * Additif + idempotent (drop-then-add), aucune valeur retirée (GA-08), valeur
 * ajoutée en FIN de liste. RLS inchangée.
 */
export class CommercialStatusChangedActionType1793700310000 implements MigrationInterface {
  public name = 'CommercialStatusChangedActionType1793700310000'

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

/** L'ensemble COMPLET autorisé = celui de `NeedPlayActionType`
 *  (1788912847316) + la trace d'un changement de statut commercial. À garder
 *  synchronisé avec `actionTypeSchema` de `@bellum/contracts` — la spec de
 *  cette migration le vérifie valeur par valeur. */
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
]

import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Lot L-D1 (#4167, épopée #4163) — les AUTOMATISATIONS : « quand [signal] →
 * alors [inscrire dans la séquence X | préparer l'action Y] ».
 *
 *  1. `outreach_messages.source` et `outreach_call_tasks.source` acceptent
 *     `automation` : ce qu'une règle prépare arrive dans « À traiter » avec sa
 *     provenance. Les deux CHECK sont élargis AVANT le code qui écrit la valeur
 *     (GA-11/GA-12) — rien n'est retiré, chaque valeur existante est reprise.
 *  2. `automation_rules` : la règle (signal, action, interrupteur, plafond de
 *     crédits). PERSONNELLE (`user_id` = le commercial dont les contacts sont
 *     inscrits) et scopée à l'espace.
 *  3. `automation_rule_firings` : le JOURNAL de ce que chaque règle a fait pour
 *     chaque signal — le compteur « 30 jours » est un COMPTAGE de ces lignes,
 *     jamais une estimation. `(rule_id, signal_ref)` est unique : le même signal
 *     ne déclenche jamais deux fois la même règle (le passage du matin est rejouable).
 *
 * Additive : aucune ligne existante n'est réécrite, aucune règle n'est créée
 * pour personne (une règle naît d'un geste humain, éteinte).
 */
export class AutomationRules1796540127394 implements MigrationInterface {
  name = 'AutomationRules1796540127394'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE outreach_messages DROP CONSTRAINT IF EXISTS outreach_messages_source_check`)
    await queryRunner.query(`
      ALTER TABLE outreach_messages ADD CONSTRAINT outreach_messages_source_check CHECK (source IN (
        'laura', 'contacts', 'targets', 'accounts', 'opportunities', 'needs',
        'pool', 'actions', 'sequences', 'today', 'automation'))
    `)
    await queryRunner.query(
      `ALTER TABLE outreach_call_tasks DROP CONSTRAINT IF EXISTS outreach_call_tasks_source_check`,
    )
    await queryRunner.query(`
      ALTER TABLE outreach_call_tasks ADD CONSTRAINT outreach_call_tasks_source_check CHECK (source IN (
        'laura', 'contacts', 'targets', 'accounts', 'opportunities', 'needs',
        'pool', 'actions', 'sequences', 'today', 'automation'))
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS automation_rules (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id     uuid NOT NULL,
        user_id          uuid NOT NULL,
        signal           text NOT NULL,
        action_kind      text NOT NULL,
        playbook_key     text,
        prepared_action  text,
        inactive_days    integer,
        enabled          boolean NOT NULL DEFAULT false,
        credit_cap       integer,
        template_key     text,
        last_run_at      timestamptz,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT automation_rules_signal_check CHECK (signal IN (
          'hiring', 'new_decision_maker', 'tender', 'target_change', 'inactive_account', 'mission_end')),
        CONSTRAINT automation_rules_action_kind_check CHECK (action_kind IN ('enroll_sequence', 'prepare_action')),
        CONSTRAINT automation_rules_playbook_key_check CHECK (playbook_key IS NULL OR playbook_key IN (
          'hiring_signal', 'new_cio', 'tender', 'win_back', 'after_meeting',
          'bench_consultant', 'regie_to_forfait', 'warm_contact')),
        CONSTRAINT automation_rules_prepared_action_check CHECK (
          prepared_action IS NULL OR prepared_action IN ('email_to_review', 'call_to_make')),
        CONSTRAINT automation_rules_grammar_check CHECK (
          (action_kind = 'enroll_sequence' AND playbook_key IS NOT NULL AND prepared_action IS NULL)
          OR (action_kind = 'prepare_action' AND prepared_action IS NOT NULL AND playbook_key IS NULL)),
        CONSTRAINT automation_rules_inactive_days_check CHECK (
          inactive_days IS NULL OR (inactive_days >= 7 AND inactive_days <= 365)),
        CONSTRAINT automation_rules_credit_cap_check CHECK (credit_cap IS NULL OR credit_cap >= 0)
      );
      CREATE INDEX IF NOT EXISTS idx_automation_rules_workspace ON automation_rules (workspace_id, user_id);
      ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS automation_rule_firings (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        rule_id        uuid NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
        workspace_id   uuid NOT NULL,
        user_id        uuid NOT NULL,
        signal         text NOT NULL,
        signal_ref     text NOT NULL,
        contact_id     uuid,
        account_id     uuid,
        outcome        text NOT NULL,
        reason         text,
        sequence_id    uuid,
        message_id     uuid,
        credits_spent  integer NOT NULL DEFAULT 0,
        fired_at       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT automation_rule_firings_outcome_check CHECK (outcome IN (
          'enrolled', 'prepared', 'excluded', 'no_contact', 'failed', 'cap_reached')),
        CONSTRAINT automation_rule_firings_credits_check CHECK (credits_spent >= 0)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS automation_rule_firings_rule_signal_uidx
        ON automation_rule_firings (rule_id, signal_ref);
      CREATE INDEX IF NOT EXISTS idx_automation_rule_firings_workspace ON automation_rule_firings (workspace_id, fired_at);
      ALTER TABLE automation_rule_firings ENABLE ROW LEVEL SECURITY;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS automation_rule_firings`)
    await queryRunner.query(`DROP TABLE IF EXISTS automation_rules`)
    // On ne rétrécit pas les CHECK : une ligne `automation` déjà écrite les violerait (GA-11).
  }
}

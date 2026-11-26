import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Théo C automations-editeur — l'ÉDITEUR d'une règle d'automatisation : un nom, une VERSION, un BROUILLON à tester avant
 * de l'activer, l'ARCHIVAGE (on archive, on ne supprime pas) et le JOURNAL DES ESSAIS.
 *
 *  1. `automation_rules` gagne `name`, `version` (1 pour toute règle existante — comportement inchangé), `draft`
 *     (la phrase en attente, jsonb), `draft_tested_at` (le dernier essai RÉUSSI du brouillon ; remis à zéro à chaque
 *     enregistrement du brouillon) et `archived_at`. Additif : aucune ligne n'est réécrite.
 *  2. `automation_rule_trials` : un essai lit les vraies données de l'espace et ne crée ni tâche ni message. Sa
 *     contrainte (issue, cible, signal) est posée ICI, avant le code qui l'écrit (GA-11/12). `rule_id` n'est pas une clé
 *     étrangère : le nom de la règle est copié, l'essai survit à l'archivage ET à une suppression éventuelle.
 */
export class AutomationRuleEditor1796574823417 implements MigrationInterface {
  public name = 'AutomationRuleEditor1796574823417'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE automation_rules
        ADD COLUMN IF NOT EXISTS name text,
        ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS draft jsonb,
        ADD COLUMN IF NOT EXISTS draft_tested_at timestamptz,
        ADD COLUMN IF NOT EXISTS archived_at timestamptz
    `)
    await queryRunner.query(`
      ALTER TABLE automation_rules ADD CONSTRAINT automation_rules_version_check CHECK (version >= 1)
    `)
    await queryRunner.query(`
      ALTER TABLE automation_rules ADD CONSTRAINT automation_rules_name_check
        CHECK (name IS NULL OR (char_length(name) BETWEEN 1 AND 120))
    `)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS automation_rule_trials (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id     uuid NOT NULL,
        user_id          uuid NOT NULL,
        rule_id          uuid,
        rule_name        text NOT NULL,
        signal           text NOT NULL,
        target           text NOT NULL,
        outcome          text NOT NULL,
        situations_read  integer,
        situation_labels text[] NOT NULL DEFAULT '{}',
        would_act        integer,
        reason           text,
        created_at       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT automation_rule_trials_signal_check CHECK (signal IN (
          'hiring', 'new_decision_maker', 'tender', 'target_change', 'inactive_account', 'mission_end')),
        CONSTRAINT automation_rule_trials_target_check CHECK (target IN ('live', 'draft')),
        CONSTRAINT automation_rule_trials_outcome_check CHECK (outcome IN ('ok', 'failed')),
        CONSTRAINT automation_rule_trials_counts_check CHECK (
          (situations_read IS NULL OR situations_read >= 0) AND (would_act IS NULL OR would_act >= 0))
      );
      CREATE INDEX IF NOT EXISTS idx_automation_rule_trials_owner
        ON automation_rule_trials (workspace_id, user_id, created_at DESC);
      ALTER TABLE automation_rule_trials ENABLE ROW LEVEL SECURITY;
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2445.6 (#2442.16, #2766) — le SNAPSHOT MASQUÉ de chaque appel d'outil d'un
 * tour, pour que le bac à sable de rejeu ait un enregistrement RÉEL à
 * charger.
 *
 * Avant cette table, `ReplaySandboxExecutor` (`apps/ia/app/services/
 * chat_replay_sandbox.py`) existait, testé, sans AUCUN appelant — constat du
 * lot T01 (29/09/2026) : « du code juste, calculé, testé, que personne
 * n'appelle ». Cette table est le producteur de donnée qui manquait.
 *
 * ÉCRITE PAR L'IA (Python, `apps/ia/app/services/chat_tool_call_recording.py`)
 * — même geste que `ai_tool_call_audit_log` (`1795999346689`) : le schéma vit
 * ici (GA-11/GA-12), l'écriture part de là où l'appel a réellement lieu
 * (`chat_tools.execute_chat_tool`).
 *
 * `masked_result` a déjà traversé `mask_tool_result` (secrets MACHINE
 * seulement — voir le docstring de `chat_replay_sandbox.py`) : jamais le
 * résultat brut d'un outil.
 *
 * `workspace_id` est TOUJOURS la résolution serveur (`resolve_workspace_id`,
 * qui re-prouve l'appartenance) — jamais un identifiant pris tel quel côté
 * modèle. Nullable : un workspace irrésolvable écrit `NULL`, jamais un
 * identifiant deviné.
 *
 * Ligne d'enregistrement = jamais corrigée : aucun `updated_at`, même choix
 * que `ai_tool_call_audit_log`.
 */
export class ChatToolCallRecordings1796402011234 implements MigrationInterface {
  public name = 'ChatToolCallRecordings1796402011234'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_tool_call_recordings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        turn_id uuid NOT NULL,
        workspace_id uuid,
        tool_name text NOT NULL,
        masked_result jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    // « Que portait CE tour ? » est la lecture attendue par le bac à sable de
    // rejeu — les enregistrements d'un tour, les plus récents en dernier (le
    // dernier enregistré gagne, même règle que `build_sandbox_snapshot`).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_tool_call_recordings_turn
        ON chat_tool_call_recordings (turn_id, created_at)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * L'AUDIT SERVEUR DE CHAQUE OUTIL DE CHAT (#2438.3).
 *
 * Avant cette table, aucun appel d'outil du copilote n'était journalisé :
 * `tool-registry/*` ne couvre que les connecteurs/intégrations, jamais un
 * cadre d'exécution d'outils agentiques audité (mesure du 22/09 soir, registre
 * `chat-lot2`). Un attaquant qui obtiendrait un accès modèle pouvait donc
 * appeler n'importe quel outil sans laisser de trace nommant le workspace.
 *
 * ÉCRITE PAR L'IA (Python, `apps/ia/app/services/tool_call_audit.py`) —
 * même geste que `rag_documents` (`1767225600000-Init.ts`) : le schéma
 * appartient à l'API (GA-11/GA-12), l'écriture part de là où l'appel a
 * réellement lieu.
 *
 * `workspace_id` est TOUJOURS la résolution serveur (`resolve_workspace_id`,
 * qui re-prouve l'appartenance) — jamais un identifiant pris tel quel côté
 * modèle. Nullable : un workspace irrésolvable écrit `NULL`, jamais un
 * identifiant deviné (même doctrine que le résolveur).
 *
 * Ligne d'audit = jamais corrigée : aucun `updated_at`, même choix que
 * `backoffice_audit_events` (`1791821777001-BackofficeAuditJournal.ts`).
 */
export class AiToolCallAuditLog1795999346689 implements MigrationInterface {
  public name = 'AiToolCallAuditLog1795999346689'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ai_tool_call_audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        workspace_id uuid,
        tool_name text NOT NULL,
        status text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ai_tool_call_audit_log_status_check CHECK (status IN (
          'done',
          'error'
        ))
      )
    `)

    // « Qu'a fait ce workspace récemment ? » est la lecture de recette
    // attendue par #2438.3 — les plus récents d'abord, par espace.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_tool_call_audit_log_workspace
        ON ai_tool_call_audit_log (workspace_id, created_at DESC)
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_tool_call_audit_log_tool
        ON ai_tool_call_audit_log (tool_name, created_at DESC)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

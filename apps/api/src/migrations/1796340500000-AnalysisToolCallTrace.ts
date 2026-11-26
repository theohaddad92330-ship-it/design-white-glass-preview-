import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LA TRACE DES OUTILS D'UN RUN D'ANALYSE, PERSISTÉE (#2905, #2442.16).
 *
 * Tranche : « rejeu du pipeline d'analyse sans envoi ni débit » suppose de
 * savoir, après coup, QUELS outils un run a appelés — Brave, Firecrawl,
 * Apollo, Pappers, chaque prompt Claude. Avant cette table, cette répartition
 * (`app/services/run_metrics.py`) n'existait qu'EN MÉMOIRE dans le worker
 * Python (`_RUNS`, plafonné à 256 runs, perdu à chaque redémarrage) et dans
 * une ligne de log — jamais une trace qu'on peut relire une heure après le
 * run. Le rejeu complet (« relancer le modèle et ses outils contre des
 * résultats enregistrés en sandbox ») reste un chantier distinct — cette
 * table lui donne son PRÉALABLE : la trace elle-même, durable.
 *
 * Une ligne = UN fournisseur pour UN run (`correlation_id`), même granularité
 * que le dict déjà calculé par `run_metrics.get_metrics` — jamais une seconde
 * agrégation, jamais un chiffre recalculé différemment. `account_id` est
 * nullable : la phase 1 (recherche d'une entreprise pas encore compte) n'en a
 * pas encore (voir `phase1_research.py`, commentaire ligne 287) — un run sans
 * compte garde son nom d'entreprise et reste retrouvable par
 * `correlation_id`.
 *
 * ÉCRITE PAR L'IA (Python, `apps/ia/app/services/analysis_tool_trace.py`) —
 * même geste que `ai_tool_call_audit_log` (`1795999346689-AiToolCallAuditLog.ts`) :
 * le schéma appartient à l'API (GA-11/GA-12), l'écriture part de là où l'appel
 * a réellement lieu.
 *
 * Ligne de trace = jamais corrigée : aucun `updated_at`.
 */
export class AnalysisToolCallTrace1796340500000 implements MigrationInterface {
  public name = 'AnalysisToolCallTrace1796340500000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS analysis_tool_call_trace (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        correlation_id text NOT NULL,
        account_id uuid,
        company_name text NOT NULL,
        provider text NOT NULL,
        calls integer NOT NULL,
        errors integer NOT NULL,
        duration_ms integer NOT NULL,
        wait_ms integer NOT NULL,
        cost_usd numeric NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT analysis_tool_call_trace_calls_check CHECK (calls >= 0),
        CONSTRAINT analysis_tool_call_trace_errors_check CHECK (errors >= 0),
        CONSTRAINT analysis_tool_call_trace_duration_check CHECK (duration_ms >= 0),
        CONSTRAINT analysis_tool_call_trace_wait_check CHECK (wait_ms >= 0),
        CONSTRAINT analysis_tool_call_trace_cost_check CHECK (cost_usd >= 0)
      )
    `)

    // « Quels outils un run a-t-il appelés ? » — la lecture attendue pour le
    // préalable du rejeu, par run.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_analysis_tool_call_trace_correlation
        ON analysis_tool_call_trace (correlation_id, created_at DESC)
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_analysis_tool_call_trace_account
        ON analysis_tool_call_trace (account_id, created_at DESC)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LA DÉCLARATION D'ÉVALUATIONS DE ROUTAGE FOURNISSEUR, ÉCRITE (#2975, #2440.82).
 *
 * `provider_evals.py` disait déjà « à évaluer » pour toute destination routée
 * autre que la référence Anthropic, tant que l'opérateur n'avait pas posé
 * `LLM_ROUTING_EVALS_PASSED` ET redéployé — le seul geste pour sortir une
 * destination de ce statut passait par qui a accès au déploiement, jamais par
 * la console d'opérations qui AFFICHE pourtant le statut (`/health`,
 * `model-routing-panel.tsx`). Cette table donne l'écriture : une ligne par
 * destination, posée depuis `POST /config/model-routing/evals`.
 *
 * `destination_key` reprend le MÊME format que la variable d'env qu'elle
 * complète (`provider` ou `provider:model`, en minuscules) — les deux
 * chemins répondent à la même question, fusionnés par
 * `provider_evals.eval_status_by_task` (jamais deux vérités qui divergent).
 *
 * UNIQUE sur `destination_key` : redéclarer CORRIGE la ligne (auteur, note,
 * horodatage) plutôt que d'empiler un historique — la déclaration dit
 * « évaluée aujourd'hui, par cette personne », jamais un journal d'essais.
 *
 * ÉCRITE PAR L'IA (Python, `apps/ia/app/services/provider_eval_declarations.py`)
 * — même geste que `analysis_tool_call_trace` (`1796340500000`) : le schéma
 * appartient à l'API (GA-11/GA-12), l'écriture part de là où l'appel a
 * réellement lieu.
 */
export class LlmRoutingEvalDeclarations1796437800001 implements MigrationInterface {
  public name = 'LlmRoutingEvalDeclarations1796437800001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS llm_routing_eval_declarations (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        destination_key  text NOT NULL,
        declared_by      text NOT NULL,
        note             text,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS llm_routing_eval_declarations_key_key
        ON llm_routing_eval_declarations (destination_key)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

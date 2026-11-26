import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2448.8 / #2882.11 (épopée #2882) — le journal anonyme, PAR PALIER, qui
 * rend « estimer coût et durée avant le run » possible sans deviner un
 * chiffre. Voir `ChatTurnCostSampleEntity` pour la raison complète.
 *
 * CHECK sur `tier` posé ICI, avant tout code qui écrit (GA-11/GA-12) : liste
 * fermée aux deux paliers réels de `chat_model_routing.py` (`Tier`), jamais
 * `auto` (déjà résolu en `fast`/`deep` à la fin d'un tour).
 */
export class ChatTurnCostSamples1796405100123 implements MigrationInterface {
  public name = 'ChatTurnCostSamples1796405100123'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_turn_cost_samples (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tier text NOT NULL,
        duration_ms integer NOT NULL,
        cost_usd numeric NULL,
        measured_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chat_turn_cost_samples_tier_check CHECK (tier IN ('fast', 'deep')),
        CONSTRAINT chat_turn_cost_samples_duration_ms_check CHECK (duration_ms >= 0)
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS chat_turn_cost_samples_tier_measured_at_idx
        ON chat_turn_cost_samples (tier, measured_at)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

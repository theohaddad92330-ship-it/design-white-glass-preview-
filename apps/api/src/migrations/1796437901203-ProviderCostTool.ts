import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2442.12 (épopée #2879, lot M10 09/10) — LE COÛT PAR OUTIL DE CHAT.
 *
 * `provider_costs` disait QUI, QUOI (fonctionnalité, fournisseur, opération)
 * et COMBIEN, jamais par QUEL OUTIL de Laura : un tour de chat qui appelait
 * trois outils se lisait comme un seul bloc « chat ». Le service IA étiquette
 * désormais chaque ligne par l'outil qui l'a consommée (`cost_ledger.bind_tool`,
 * posé au seul point d'exécution d'un outil, `chat_orchestrator`).
 *
 * NULLABLE à dessein : NULL = « hors outil » (génération du tour, phase
 * d'analyse) OU « ligne écrite avant cette colonne » — jamais un outil deviné.
 *
 * La contrainte est posée AVANT le code qui écrit (GA-11/GA-12) et admet la
 * forme d'un identifiant d'outil, rien d'autre : la même expression que
 * `PROVIDER_COST_TOOL_PATTERN` (`provider-cost.service.ts`) et `_TOOL_NAME_RE`
 * (`cost_ledger.py`), vérifiée par la spec de cette migration.
 */
export class ProviderCostTool1796437901203 implements MigrationInterface {
  name = 'ProviderCostTool1796437901203'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE provider_costs ADD COLUMN IF NOT EXISTS tool text`)
    await queryRunner.query(`ALTER TABLE provider_costs DROP CONSTRAINT IF EXISTS provider_costs_tool_check`)
    await queryRunner.query(`
      ALTER TABLE provider_costs
        ADD CONSTRAINT provider_costs_tool_check CHECK (tool IS NULL OR tool ~ '^[a-z][a-z0-9_]{0,63}$')
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS provider_costs_tool_idx ON provider_costs (tool) WHERE tool IS NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS provider_costs_tool_idx`)
    await queryRunner.query(`ALTER TABLE provider_costs DROP CONSTRAINT IF EXISTS provider_costs_tool_check`)
    await queryRunner.query(`ALTER TABLE provider_costs DROP COLUMN IF EXISTS tool`)
  }
}

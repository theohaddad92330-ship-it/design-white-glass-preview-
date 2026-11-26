import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Tool Registry v2 (roadmap §8-9 « Connected Account Memory ») : `last_sync`
 * doit refléter le dernier USAGE réel d'une connexion, pas sa dernière
 * reconfiguration. `updated_at` bouge sur un refresh de token OAuth ou un
 * changement d'URL — pas sur un export CRM ni sur un fan-out webhook. D'où une
 * colonne dédiée `last_used_at`, tamponnée aux points d'usage réels :
 *  - `crm_connections.last_used_at` → export contact / log d'activité CRM
 *  - `integrations.last_used_at`    → envoi test + fan-out d'événement webhook
 *
 * Additif + idempotent (`ADD COLUMN IF NOT EXISTS`, NULL par défaut — jamais de
 * date inventée pour les connexions existantes). RLS inchangé.
 */
export class ToolRegistryLastUsedAt1785990000000 implements MigrationInterface {
  public name = 'ToolRegistryLastUsedAt1785990000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ`)
    await queryRunner.query(`ALTER TABLE crm_connections ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

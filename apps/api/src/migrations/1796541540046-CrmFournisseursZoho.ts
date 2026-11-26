import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4187 + #4189 (14/10/2026, épopée #4184) — Zoho CRM et la lecture/synchro
 * incrémentale de tous les CRM.
 *
 * Posé ICI avant tout code qui écrit une valeur neuve (GA-11/GA-12) :
 *
 * 1. Les trois CHECK de fournisseur (`contact_crm_exports`, `account_crm_exports`,
 *    `sync_links`) admettent `zoho`. Aucune valeur retirée (GA-08).
 *    `crm_connections.provider` est un TEXT nu : rien à élargir.
 * 2. `crm_sync_cursors` — le CURSEUR de la synchro incrémentale : la date de
 *    modification la plus récente vue, par (espace, fournisseur, objet). C'est
 *    la seule chose qui sépare « relire ce qui a bougé » de « tout relire » ;
 *    il n'avance que sur un passage qui a abouti (`last_error` porte le dernier
 *    échec, TEL QUEL). La date de dernière synchro affichée à l'écran est
 *    `last_run_at`.
 * 3. `sync_runs.conflict_count` — le compteur VISIBLE des fiches modifiées des
 *    deux côtés : la correction humaine est gardée, l'écart est compté et
 *    journalisé (`sync_record_events.action = 'conflict'`), jamais tu.
 */
export class CrmFournisseursZoho1796541540046 implements MigrationInterface {
  public name = 'CrmFournisseursZoho1796541540046'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE contact_crm_exports DROP CONSTRAINT IF EXISTS contact_crm_exports_provider_check`,
    )
    await queryRunner.query(`
      ALTER TABLE contact_crm_exports ADD CONSTRAINT contact_crm_exports_provider_check
        CHECK (provider IN ('hubspot', 'salesforce', 'pipedrive', 'attio', 'odoo', 'zoho'))
    `)
    await queryRunner.query(
      `ALTER TABLE account_crm_exports DROP CONSTRAINT IF EXISTS account_crm_exports_provider_check`,
    )
    await queryRunner.query(`
      ALTER TABLE account_crm_exports ADD CONSTRAINT account_crm_exports_provider_check
        CHECK (provider IN ('hubspot', 'salesforce', 'pipedrive', 'attio', 'odoo', 'zoho'))
    `)
    await queryRunner.query(`ALTER TABLE sync_links DROP CONSTRAINT IF EXISTS sync_links_provider_check`)
    await queryRunner.query(`
      ALTER TABLE sync_links ADD CONSTRAINT sync_links_provider_check
        CHECK (provider IN ('hubspot', 'salesforce', 'pipedrive', 'attio', 'odoo', 'zoho', 'csv'))
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS crm_sync_cursors (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        provider text NOT NULL,
        entity_type text NOT NULL,
        cursor_at timestamptz NULL,
        last_run_at timestamptz NULL,
        last_run_id uuid NULL,
        last_error text NULL,
        CONSTRAINT crm_sync_cursors_entity_check CHECK (entity_type IN ('account', 'contact')),
        CONSTRAINT crm_sync_cursors_unique UNIQUE (workspace_id, provider, entity_type)
      )
    `)
    await queryRunner.query(`ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS conflict_count integer NOT NULL DEFAULT 0`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2565 — la table de la porte « créer la facture dans l'outil de gestion
 * branché par le client ». Additive : aucune colonne existante ni aucune
 * table `invoice_readiness` touchée (GA-11/GA-12 — la contrainte SQL
 * s'élargit avant le code qui écrit ces valeurs, et ici c'est une table
 * NEUVE, donc la contrainte naît déjà large des cinq états fermés).
 *
 * Voir `InvoiceConnectorWriteRequestEntity` pour le pourquoi d'une table à
 * part plutôt qu'une réutilisation de `outbound_write_requests` (porte CRM) ou
 * `ats_write_requests` (porte ERP) : même grammaire, table propre.
 */
export class InvoiceConnectorWriteRequests1795702846913 implements MigrationInterface {
  name = 'InvoiceConnectorWriteRequests1795702846913'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoice_connector_write_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        mission_id uuid NOT NULL,
        period_month date NOT NULL,
        requested_by uuid NOT NULL,
        provider text NOT NULL,
        payload jsonb NOT NULL,
        preview jsonb NOT NULL,
        state text NOT NULL DEFAULT 'created',
        invoice_reference text,
        detail text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT invoice_connector_write_requests_state_check
          CHECK (state IN ('created', 'sent', 'invoiced', 'failed', 'unknown'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS invoice_connector_write_requests_lookup_idx
        ON invoice_connector_write_requests (workspace_id, mission_id, period_month, created_at DESC)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS invoice_connector_write_requests`)
  }
}

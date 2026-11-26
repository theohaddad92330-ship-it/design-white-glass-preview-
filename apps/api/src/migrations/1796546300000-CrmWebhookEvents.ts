import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4189.7 — Décision Louis 15/10/2026 : webhooks entrants HubSpot et Salesforce.
 *
 * L'IDEMPOTENCE par identifiant d'événement : un CRM renvoie un événement qu'il croit
 * perdu ; la clé unique `(provider, event_id)` fait qu'il ne déclenche qu'UNE synchro.
 * Aucune donnée du CRM n'est stockée ici — l'identifiant, l'espace, la date. Contraintes
 * NOMMÉES (GA-177), posées avant le code qui écrit (GA-11 / GA-12).
 */
export class CrmWebhookEvents1796546300000 implements MigrationInterface {
  public name = 'CrmWebhookEvents1796546300000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS crm_webhook_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        provider text NOT NULL,
        event_id text NOT NULL,
        received_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT crm_webhook_events_provider_check CHECK (provider IN ('hubspot', 'salesforce')),
        CONSTRAINT crm_webhook_events_event_id_check CHECK (char_length(event_id) BETWEEN 1 AND 200),
        CONSTRAINT crm_webhook_events_unique UNIQUE (provider, event_id)
      )
    `)
    await queryRunner.query(`ALTER TABLE crm_webhook_events ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS crm_webhook_events`)
  }
}

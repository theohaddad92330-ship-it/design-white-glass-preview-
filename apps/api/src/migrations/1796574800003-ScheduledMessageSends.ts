import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Théo M2 — envoi programmé — DÉCISION LOUIS 22/10/2026 : un brouillon VALIDÉ par le commercial part, à l'heure
 * qu'il a choisie, par SA boîte branchée et par le même chemin que « Envoyer » au clic.
 *
 * Table neuve. Sa contrainte de statut est posée ICI, AVANT le code qui l'écrit (GA-11/12), et elle porte les cinq
 * valeurs de `scheduledSendStatusSchema` : programmé / parti / annulé / échec / inconnu.
 *
 * Ce qu'elle ne porte PAS : le corps du message. La ligne pointe la version validée (`message_draft_versions`, ligne
 * d'audit jamais corrigée) et en garde l'EMPREINTE validée — relue au départ : un texte qui ne correspond plus ne part
 * pas. Un brouillon a au plus UN envoi programmé vivant (index unique partiel) : idempotent par brouillon.
 */
export class ScheduledMessageSends1796574800003 implements MigrationInterface {
  public name = 'ScheduledMessageSends1796574800003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS scheduled_message_sends (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        version_id uuid NOT NULL REFERENCES message_draft_versions (id) ON DELETE CASCADE,
        validation_id uuid NOT NULL REFERENCES message_draft_validations (id) ON DELETE CASCADE,
        contact_id uuid NOT NULL,
        content_hash text NOT NULL,
        scheduled_at timestamptz NOT NULL,
        time_zone text NOT NULL,
        status text NOT NULL DEFAULT 'scheduled',
        attempted_at timestamptz,
        sent_at timestamptz,
        failure_code text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT scheduled_message_sends_status_check
          CHECK (status IN ('scheduled', 'sent', 'cancelled', 'failed', 'unknown')),
        CONSTRAINT scheduled_message_sends_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$')
      )
    `)
    // Un seul envoi programmé vivant par brouillon : programmer deux fois la même version ne double rien.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_message_sends_live_version
        ON scheduled_message_sends (version_id) WHERE status = 'scheduled'
    `)
    // « À venir » : les envois d'UN utilisateur dans SON espace, par heure de départ.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_message_sends_owner
        ON scheduled_message_sends (workspace_id, user_id, scheduled_at)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}

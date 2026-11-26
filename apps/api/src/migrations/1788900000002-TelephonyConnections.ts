import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La connexion téléphonie d'un espace de travail.
 *
 * Par ESPACE et non par variable d'environnement, pour la même raison que
 * l'ATS : un SaaS multi-client ne peut pas partager un standard téléphonique
 * entre toutes les ESN.
 *
 * `transcripts_enabled` par défaut à FAUX, et c'est le point important de cette
 * table. Enregistrer et transcrire une conversation engage le consentement des
 * DEUX parties : cette décision appartient à l'ESN, qui la prend en cochant une
 * case, jamais à un défaut de configuration. Un booléen `NOT NULL DEFAULT false`
 * rend l'oubli impossible — une connexion créée sans que la question soit posée
 * ne lit aucune transcription.
 */
export class TelephonyConnections1788900000002 implements MigrationInterface {
  public name = 'TelephonyConnections1788900000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS telephony_connections (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id        uuid NOT NULL,
        created_by          uuid NOT NULL,
        provider            text NOT NULL,
        credentials_enc     text NOT NULL,
        transcripts_enabled boolean NOT NULL DEFAULT false,
        last_used_at        timestamptz,
        created_at          timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT telephony_connections_workspace UNIQUE (workspace_id),
        CONSTRAINT telephony_connections_provider_check CHECK (provider IN ('aircall', 'ringover'))
      )
    `)
    await queryRunner.query(`ALTER TABLE telephony_connections ENABLE ROW LEVEL SECURITY`)
    // Aucune politique permissive : le secret ne doit jamais être lisible par le
    // client Supabase. Seule la clé de service (l'API) y accède.

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS telephony_call_logs (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        provider     text NOT NULL,
        call_id      text NOT NULL,
        crm_note_id  text,
        created_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT telephony_call_logs_unique UNIQUE (workspace_id, provider, call_id)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS telephony_call_logs_workspace_idx ON telephony_call_logs (workspace_id)`,
    )
    await queryRunner.query(`ALTER TABLE telephony_call_logs ENABLE ROW LEVEL SECURITY`)
    // La trace des appels DÉJÀ journalisés dans le CRM. C'est elle qui rend le
    // versement idempotent : rejouer une semaine ne doit pas déposer deux fois
    // la même note. Le CRM ne dédoublonne pas pour nous.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS telephony_call_logs`)
    await queryRunner.query(`DROP TABLE IF EXISTS telephony_connections`)
  }
}

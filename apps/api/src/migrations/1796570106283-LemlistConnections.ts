import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4427 — Lemlist, l'outil de séquences de l'ESN.
 *
 * `lemlist_connections` : la clé d'API est PAR ESPACE, chiffrée comme celles de
 * l'ATS et de la téléphonie — un SaaS multi-client ne partage pas le compte
 * Lemlist d'une ESN avec les autres. Aucune variable d'environnement globale.
 *
 * `lemlist_lead_pushes` : la trace d'un contact poussé dans une campagne. Elle
 * porte l'identifiant du lead rendu par Lemlist, sans lequel ses statuts
 * (envoyé, ouvert, répondu…) ne peuvent pas être relus sur la fiche (#4427.3).
 * Unique par (espace, contact, campagne) : Lemlist refuse lui-même le doublon,
 * la trace n'en invente pas un second.
 *
 * RLS activée sans politique permissive : seule la clé de service (l'API) lit
 * ces lignes, le secret n'est jamais lisible par le client Supabase.
 */
export class LemlistConnections1796570106283 implements MigrationInterface {
  name = 'LemlistConnections1796570106283'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS lemlist_connections (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id    uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        created_by      uuid NOT NULL,
        credentials_enc text NOT NULL,
        last_used_at    timestamptz,
        created_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT lemlist_connections_workspace UNIQUE (workspace_id)
      )
    `)
    await queryRunner.query(`ALTER TABLE lemlist_connections ENABLE ROW LEVEL SECURITY`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS lemlist_lead_pushes (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        contact_id    uuid NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
        pushed_by     uuid NOT NULL,
        campaign_id   text NOT NULL,
        campaign_name text,
        lead_id       text,
        created_at    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT lemlist_lead_pushes_unique UNIQUE (workspace_id, contact_id, campaign_id)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS lemlist_lead_pushes_contact_idx ON lemlist_lead_pushes (contact_id)`,
    )
    await queryRunner.query(`ALTER TABLE lemlist_lead_pushes ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS lemlist_lead_pushes`)
    await queryRunner.query(`DROP TABLE IF EXISTS lemlist_connections`)
  }
}

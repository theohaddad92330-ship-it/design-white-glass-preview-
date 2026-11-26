import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le lien d'un espace de travail vers son ATS/ERP.
 *
 * Décision Louis du 03/08 : les identifiants BoondManager passent de la variable
 * d'environnement globale à une connexion PAR ESPACE. La variable reste en repli
 * — un opérateur qui teste sur une instance interne n'a rien à refaire — mais un
 * SaaS multi-client ne peut pas partager un seul ATS entre toutes les ESN.
 *
 * Table dédiée et non `crm_connections` : un ATS n'est pas un CRM. Les y ranger
 * obligerait le service CRM à filtrer un provider étranger à chaque lecture,
 * c'est-à-dire à créer exactement le genre de confusion qui finit par exporter
 * un contact vers un ERP de facturation.
 *
 * Le secret est chiffré au repos (AES-256-GCM, même helper que les jetons CRM).
 * Une seule colonne : le couple « jeton client + clé » de l'espace développeur
 * y est concaténé, donc un seul endroit à auditer.
 */
export class AtsConnections1788800000003 implements MigrationInterface {
  public name = 'AtsConnections1788800000003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ats_connections (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id    uuid NOT NULL,
        created_by      uuid NOT NULL,
        provider        text NOT NULL,
        auth_mode       text NOT NULL,
        credentials_enc text NOT NULL,
        base_url        text,
        last_used_at    timestamptz,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ats_connections_workspace_provider UNIQUE (workspace_id, provider),
        CONSTRAINT ats_connections_auth_mode_check CHECK (auth_mode IN ('user_token', 'client_jwt'))
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ats_connections_workspace_idx ON ats_connections (workspace_id)`,
    )
    await queryRunner.query(`ALTER TABLE ats_connections ENABLE ROW LEVEL SECURITY`)
    // Le secret ne doit JAMAIS être lisible par le client Supabase : aucune
    // politique permissive n'est créée. Seule la clé de service (l'API) lit.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ats_connections`)
  }
}

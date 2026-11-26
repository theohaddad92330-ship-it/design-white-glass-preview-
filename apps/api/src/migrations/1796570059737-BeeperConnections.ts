import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4406.1 — Beeper : le branchement PERSONNEL d'un commercial à son Beeper Desktop.
 *
 * AJOUT SEULEMENT : une table neuve, aucune colonne existante touchée. Une ligne par utilisateur
 * (Beeper tourne sur SON poste) : l'URL distante qu'il a saisie (Remote Access + son tunnel), le
 * client OAuth obtenu par enregistrement dynamique, et les jetons CHIFFRÉS (AES-256-GCM, même
 * chiffrement que les CRM). `pending` = consentement en cours, aucun jeton encore.
 *
 * ⚠️ AUCUN corps de message ici, ni ailleurs : les conversations se lisent EN DIRECT à
 * l'ouverture de Messagerie (décision Louis 21/10/2026, c96).
 *
 * Contrainte NOMMÉE (GA-177), posée avant le code qui l'écrit (GA-11 / GA-12) : `status`.
 * RLS : lecture par l'utilisateur concerné seulement ; l'API passe par le rôle de service.
 */
export class BeeperConnections1796570059737 implements MigrationInterface {
  public name = 'BeeperConnections1796570059737'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS beeper_connections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        workspace_id uuid,
        base_url text NOT NULL,
        tunnel_declared boolean NOT NULL DEFAULT false,
        status text NOT NULL DEFAULT 'pending',
        client_id text,
        client_secret_enc text,
        authorization_endpoint text,
        token_endpoint text,
        revocation_endpoint text,
        access_token_enc text,
        refresh_token_enc text,
        expires_at timestamptz,
        scope text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT beeper_connections_status_check CHECK (status IN ('pending', 'connected'))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS beeper_connections_user_uidx ON beeper_connections (user_id)
    `)
    await queryRunner.query(`ALTER TABLE beeper_connections ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE POLICY beeper_connections_read ON beeper_connections FOR SELECT
          USING (user_id = auth.uid());
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS beeper_connections`)
  }
}

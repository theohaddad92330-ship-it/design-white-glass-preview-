import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2705 — les prospects du formulaire obligatoire du lien de démo public.
 *
 * Ni `workspace_id` ni `user_id` : un prospect n'a pas de compte, seulement
 * une adresse à recontacter (voir `table-scopes.ts`, `demo_leads`, catégorie
 * `shared`/`operator`). RLS activée SANS policy : aucun rôle Supabase
 * `anon`/`authenticated` n'y accède jamais depuis le navigateur — seule l'API
 * (rôle service, qui contourne RLS) et le back-office (proxy interne) la
 * lisent. C'est le même filet que sur les tables scopées, appliqué à une
 * table qui n'a justement personne à qui appartenir.
 *
 * `email` porte la contrainte d'unicité qui fait tenir « une ligne par
 * e-mail » (#2705) : une deuxième soumission du même e-mail met à jour la
 * ligne existante au lieu d'en créer une seconde.
 */
export class DemoLeads1795998671943 implements MigrationInterface {
  name = 'DemoLeads1795998671943'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS demo_leads (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        first_name      text NOT NULL,
        last_name       text NOT NULL,
        email           text NOT NULL,
        job_title       text NOT NULL,
        company         text NOT NULL,
        phone           text,
        device_id       text,
        source          text NOT NULL DEFAULT 'demo',
        first_access_at timestamptz NOT NULL DEFAULT now(),
        last_access_at  timestamptz NOT NULL DEFAULT now(),
        access_count    integer NOT NULL DEFAULT 1,
        utm_source      text,
        utm_medium      text,
        utm_campaign    text,
        utm_term        text,
        utm_content     text,
        CONSTRAINT demo_leads_email_unique UNIQUE (email),
        CONSTRAINT demo_leads_access_count_check CHECK (access_count > 0)
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS demo_leads_device_id_idx ON demo_leads (device_id)`)
    await queryRunner.query(`ALTER TABLE demo_leads ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS demo_leads`)
  }
}

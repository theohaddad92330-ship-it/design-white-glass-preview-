import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2927 (#2159.54/.55) — LA PORTÉE « PERSONNEL » DE L'IMPORT DE CONTACTS.
 *
 * Les lots X53/X60 ont refusé, à raison, une colonne de portée sur `contacts` : 90 lectures SQL brutes et
 * ~100 fichiers lisent cette table, et un contact « Personnel » filtré sur une partie seulement des chemins
 * serait une promesse de confidentialité non tenue. Tranché sans Louis : les contacts personnels vivent dans
 * LEUR table. Aucun lecteur existant ne la connaît — la confidentialité tient par construction, pas par un
 * filtre à poser site par site. Seul le propriétaire (`user_id`) les lit.
 *
 * `universal_import_jobs.scope` : où un job écrit (`workspace` = comportement historique). Posée AVANT le code
 * qui l'écrit (GA-11/12).
 */
export class PersonalContacts1796426312345 implements MigrationInterface {
  public name = 'PersonalContacts1796426312345'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE universal_import_jobs
        ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'workspace'
    `)
    await queryRunner.query(`
      ALTER TABLE universal_import_jobs
        ADD CONSTRAINT universal_import_jobs_scope_check CHECK (scope IN ('workspace', 'personal'))
    `)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS personal_contacts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        full_name text NOT NULL,
        title text,
        email text,
        phone text,
        linkedin_url text,
        tags text[] NOT NULL DEFAULT '{}',
        family text,
        priority integer,
        source text,
        lifecycle_state text,
        extra jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_personal_contacts_owner ON personal_contacts (workspace_id, user_id, account_id)`,
    )
    await queryRunner.query(`ALTER TABLE personal_contacts ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(
      `CREATE POLICY personal_contacts_owner ON personal_contacts USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS personal_contacts`)
    await queryRunner.query(
      `ALTER TABLE universal_import_jobs DROP CONSTRAINT IF EXISTS universal_import_jobs_scope_check`,
    )
    await queryRunner.query(`ALTER TABLE universal_import_jobs DROP COLUMN IF EXISTS scope`)
  }
}

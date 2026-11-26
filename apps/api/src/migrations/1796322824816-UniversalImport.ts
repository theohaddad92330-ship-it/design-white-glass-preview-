import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * L'IMPORT UNIVERSEL — `extra` sur les tables cibles, et le job persistant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'EXIGENCE (Louis, 27/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * N'importe quel nombre de lignes, n'importe quel type ; Bellum ne bloque
 * JAMAIS un utilisateur. Deux choses manquaient en base pour le tenir :
 *
 * 1. **`extra jsonb` sur les quatre tables cibles écrites** (`contacts`,
 *    `accounts`, `consultants`, `project_needs`). Une colonne du fichier
 *    SANS champ d'accueil (« Code client ERP », « Commercial historique »…)
 *    finissait dans « colonnes ignorées » — donc perdue. Elle est désormais
 *    conservée sous son EN-TÊTE d'origine et affichée sur la fiche. `NOT NULL
 *    DEFAULT '{}'` : un objet vide dit « rien d'importé en plus », jamais un
 *    `null` que chaque lecteur devrait deviner. Posée AVANT le code qui l'écrit
 *    (GA-11/12) — le premier INSERT d'un import ne doit pas découvrir la colonne.
 *
 * 2. **`universal_import_jobs` + `universal_import_issues`.** L'import devient
 *    ASYNCHRONE (file BullMQ `universal-import`), lu en STREAMING par paquets.
 *    `committed_rows` est le point de reprise : chaque paquet s'écrit dans UNE
 *    transaction avec lui — un job interrompu reprend au dernier paquet VALIDÉ.
 *    Les doublons proposés et les lignes rejetées vont dans une table FILLE et
 *    non dans un jsonb : un fichier de 200 000 lignes peut en porter 50 000, et
 *    le rapport téléchargeable les relit en flux.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PORTÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * `workspace_id` sur les DEUX tables, NOT NULL : deux espaces sont deux
 * concurrents, et le rapport se lit par `(workspace_id, job_id)` — jamais par
 * l'identifiant seul. `user_id` dit QUI a lancé, ce n'est pas une clé de portée.
 */
/** Les tables qu'un type ÉCRIT du registre alimente — un type neuf écrit y ajoute la sienne. */
const EXTRA_TABLES = ['contacts', 'accounts', 'consultants', 'project_needs']

export class UniversalImport1796322824816 implements MigrationInterface {
  public name = 'UniversalImport1796322824816'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of EXTRA_TABLES) {
      await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb`)
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS universal_import_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        type text NOT NULL,
        format text NOT NULL,
        filename text NOT NULL,
        account_id uuid,
        status text NOT NULL DEFAULT 'uploading',
        parts_expected integer NOT NULL,
        parts_received integer NOT NULL DEFAULT 0,
        mapping jsonb,
        total_rows integer,
        committed_rows integer NOT NULL DEFAULT 0,
        imported_count integer NOT NULL DEFAULT 0,
        duplicate_count integer NOT NULL DEFAULT 0,
        rejected_count integer NOT NULL DEFAULT 0,
        error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    // Nommées explicitement (GA-177) — voir le MAPPING de
    // `check-constraints-cover-enums.spec.ts` (GA-12).
    await queryRunner.query(
      `ALTER TABLE universal_import_jobs DROP CONSTRAINT IF EXISTS universal_import_jobs_type_check`,
    )
    await queryRunner.query(`
      ALTER TABLE universal_import_jobs
        ADD CONSTRAINT universal_import_jobs_type_check
        CHECK (type IN ('account', 'contact', 'need', 'mission', 'talent'))
    `)
    await queryRunner.query(
      `ALTER TABLE universal_import_jobs DROP CONSTRAINT IF EXISTS universal_import_jobs_format_check`,
    )
    await queryRunner.query(`
      ALTER TABLE universal_import_jobs
        ADD CONSTRAINT universal_import_jobs_format_check
        CHECK (format IN ('csv', 'xlsx', 'json'))
    `)
    await queryRunner.query(
      `ALTER TABLE universal_import_jobs DROP CONSTRAINT IF EXISTS universal_import_jobs_status_check`,
    )
    await queryRunner.query(`
      ALTER TABLE universal_import_jobs
        ADD CONSTRAINT universal_import_jobs_status_check
        CHECK (status IN ('uploading', 'queued', 'processing', 'done', 'failed'))
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS universal_import_jobs_workspace_idx
        ON universal_import_jobs (workspace_id, created_at DESC)
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS universal_import_issues (
        id bigserial PRIMARY KEY,
        workspace_id uuid NOT NULL,
        job_id uuid NOT NULL REFERENCES universal_import_jobs(id) ON DELETE CASCADE,
        row_number integer NOT NULL,
        kind text NOT NULL,
        reason text NOT NULL,
        existing_id uuid,
        label text
      )
    `)
    await queryRunner.query(
      `ALTER TABLE universal_import_issues DROP CONSTRAINT IF EXISTS universal_import_issues_kind_check`,
    )
    await queryRunner.query(`
      ALTER TABLE universal_import_issues
        ADD CONSTRAINT universal_import_issues_kind_check
        CHECK (kind IN ('duplicate', 'rejected'))
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS universal_import_issues_job_idx
        ON universal_import_issues (workspace_id, job_id, row_number)
    `)

    await queryRunner.query(`
      COMMENT ON TABLE universal_import_jobs IS
        'Import universel asynchrone (Louis 27/09/2026) : aucun plafond de lignes, lecture en flux par paquets. committed_rows = point de reprise, ecrit dans la meme transaction que le paquet.'
    `)

    for (const table of ['universal_import_jobs', 'universal_import_issues']) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE tablename = '${table}' AND policyname = '${table}_own_workspace'
          ) THEN
            CREATE POLICY ${table}_own_workspace ON ${table}
              USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
          END IF;
        EXCEPTION
          WHEN undefined_function OR undefined_table OR undefined_object THEN NULL;
        END
        $$
      `)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS universal_import_issues`)
    await queryRunner.query(`DROP TABLE IF EXISTS universal_import_jobs`)
    for (const table of EXTRA_TABLES) {
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS extra`)
    }
  }
}

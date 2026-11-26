import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * REPRISE et COHABITATION (T9) — importer un CRM existant sans doublonner.
 *
 * Trois tables, une par question qu'une équipe pose le lendemain d'une reprise :
 *
 *  - `sync_links` — « est-ce que ce contact est déjà chez nous ? ». C'est la
 *    seule chose qui empêche un second import de créer une seconde fiche. Son
 *    index unique porte le FOURNISSEUR : le même identifiant peut exister chez
 *    deux CRM sans désigner la même personne.
 *  - `sync_runs` — « qu'est-ce que cet import a fait ? », y compris quand il
 *    n'a rien fait (`dry_run`).
 *  - `sync_record_events` — « d'où vient CE contact, et pourquoi ce champ
 *    a-t-il changé ? ». Sans journal par enregistrement, la réponse est
 *    « l'import l'a fait », ce qui n'aide personne.
 *
 * `sync_record_events` n'a pas de clé étrangère vers `contacts` ou `accounts` :
 * le journal doit SURVIVRE à la suppression de l'enregistrement qu'il décrit.
 * C'est précisément quand une fiche a disparu qu'on cherche à savoir d'où elle
 * venait.
 */
export class CrmSyncLinks1789403729518 implements MigrationInterface {
  public name = 'CrmSyncLinks1789403729518'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sync_links (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        provider text NOT NULL,
        entity_type text NOT NULL,
        external_id text NOT NULL,
        internal_id uuid NOT NULL,
        last_synced_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT sync_links_provider_check CHECK (
          provider IN ('hubspot', 'salesforce', 'pipedrive', 'attio', 'csv')
        ),
        CONSTRAINT sync_links_entity_check CHECK (entity_type IN ('account', 'contact'))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS sync_links_external_unique
        ON sync_links (workspace_id, provider, entity_type, external_id)
    `)
    // « Ce contact vient-il d'un import ? » — la question posée depuis la fiche.
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS sync_links_internal_idx ON sync_links (internal_id)`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sync_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        provider text NOT NULL,
        entity_type text NOT NULL,
        dry_run boolean NOT NULL DEFAULT true,
        created integer NOT NULL DEFAULT 0,
        updated integer NOT NULL DEFAULT 0,
        skipped_count integer NOT NULL DEFAULT 0,
        truncated boolean NOT NULL DEFAULT false,
        started_by uuid,
        started_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz,
        error text
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS sync_runs_workspace_idx ON sync_runs (workspace_id, started_at DESC)`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sync_record_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id uuid NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL,
        entity_type text NOT NULL,
        external_id text NOT NULL,
        -- Pas de clé étrangère : le journal doit survivre à la suppression de
        -- l'enregistrement qu'il décrit. C'est quand une fiche a disparu qu'on
        -- cherche d'où elle venait.
        internal_id uuid,
        action text NOT NULL,
        fields text[] NOT NULL DEFAULT '{}',
        reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT sync_record_events_action_check CHECK (
          action IN ('created', 'updated', 'skipped', 'conflict')
        )
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS sync_record_events_run_idx ON sync_record_events (run_id, created_at)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS sync_record_events_internal_idx ON sync_record_events (internal_id)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS sync_record_events`)
    await queryRunner.query(`DROP TABLE IF EXISTS sync_runs`)
    await queryRunner.query(`DROP TABLE IF EXISTS sync_links`)
  }
}

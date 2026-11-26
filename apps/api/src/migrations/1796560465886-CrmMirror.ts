import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * SYNC-A (décision Louis 19/10/2026 : « toutes les infos, peu importe le CRM, on puisse les avoir dans
 * Bellum ») — LE MIROIR CRM : affaires, activités, propriétaires, pipelines et étapes du CRM branché par
 * l'espace, copiés dans des tables d'espace (`CRM_MIRROR_TABLES`, `@bellum/contracts` › `crm-mirror.ts`).
 *
 * AJOUT SEULEMENT : cinq tables neuves, et sur `accounts` / `contacts` quatre colonnes ajoutées si
 * absentes (`crm_owner_external_id`, `crm_custom_fields`, `crm_updated_at`, `crm_url`) — aucune
 * existante n'est touchée.
 *
 * Chaque table : `workspace_id`, `provider`, `external_id`, `crm_updated_at`, `crm_url`,
 * `crm_custom_fields`, `archived_at` ; UNIQUE `(workspace_id, provider, external_id)` — la clé d'upsert.
 * Une fiche disparue du CRM est ARCHIVÉE (`archived_at`), jamais supprimée.
 *
 * Contraintes NOMMÉES (GA-177), posées AVANT le code qui écrit (GA-11 / GA-12) :
 *  · `<table>_provider_check` ↔ `CRM_PROVIDERS` + `demo` (la salle de démonstration) ;
 *  · `crm_deals_status_check` ↔ `CRM_MIRROR_DEAL_STATUSES` (et `crm_stages_status_check`) ;
 *  · `crm_activities_kind_check` ↔ `CRM_MIRROR_ACTIVITY_KINDS`.
 *
 * ⚠️ `crm_activities` n'a AUCUNE colonne de corps (doctrine c96) : type, sujet, date, statut, liens.
 *
 * RLS : la forme des tables d'espace (`consultant_absences_member_read`) — un membre de l'espace LIT ;
 * l'écriture passe par l'API (rôle de service), jamais par le client.
 *
 * FK : l'espace emporte son miroir (`ON DELETE CASCADE`, le reset démo en dépend) ; un compte ou un
 * contact effacé DÉLIE l'affaire (`SET NULL`) — l'affaire reste, elle vit dans le CRM du client.
 */
/** Les six CRM du contrat, et `demo` : la salle de démonstration (aucun CRM réel derrière, comme `crm_deal_facts`). */
const PROVIDERS = `'hubspot', 'salesforce', 'pipedrive', 'attio', 'odoo', 'zoho', 'demo'`
const DEAL_STATUSES = `'open', 'won', 'lost'`
const ACTIVITY_KINDS = `'call', 'meeting', 'task', 'email', 'note'`

const MIRROR_TABLES = ['crm_owners', 'crm_pipelines', 'crm_stages', 'crm_deals', 'crm_activities'] as const
type MirrorTable = (typeof MIRROR_TABLES)[number]

/** Les colonnes communes du miroir, en tête de chaque table. */
const HEAD = `
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        provider text NOT NULL,
        external_id text NOT NULL,`

/** …et en queue : dates CRM, champs propres, archivage, la clé d'upsert. */
const tail = (table: MirrorTable): string => `
        crm_updated_at timestamptz,
        crm_url text,
        crm_custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
        archived_at timestamptz,
        synced_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ${table}_provider_check CHECK (provider IN (${PROVIDERS})),
        CONSTRAINT ${table}_external_unique UNIQUE (workspace_id, provider, external_id)`

/** Les CREATE, dans l'ordre (une étape suit son pipeline) — noms de table écrits en clair (GA-65 les lit). */
const CREATES: Readonly<Record<MirrorTable, string>> = {
  crm_owners: `
      CREATE TABLE IF NOT EXISTS crm_owners (${HEAD}
        name text,
        email text,${tail('crm_owners')}
      )`,
  crm_pipelines: `
      CREATE TABLE IF NOT EXISTS crm_pipelines (${HEAD}
        label text,${tail('crm_pipelines')}
      )`,
  crm_stages: `
      CREATE TABLE IF NOT EXISTS crm_stages (${HEAD}
        pipeline_id uuid NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
        label text,
        position int,
        status text,
        CONSTRAINT crm_stages_status_check CHECK (status IS NULL OR status IN (${DEAL_STATUSES})),${tail('crm_stages')}
      )`,
  crm_deals: `
      CREATE TABLE IF NOT EXISTS crm_deals (${HEAD}
        title text,
        pipeline_external_id text,
        stage_external_id text,
        stage_label text,
        amount numeric,
        currency text,
        status text,
        lost_reason text,
        crm_created_at timestamptz,
        expected_close_date timestamptz,
        closed_at timestamptz,
        owner_external_id text,
        account_external_id text,
        account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
        contact_external_ids text[] NOT NULL DEFAULT '{}',
        CONSTRAINT crm_deals_status_check CHECK (status IS NULL OR status IN (${DEAL_STATUSES})),${tail('crm_deals')}
      )`,
  crm_activities: `
      CREATE TABLE IF NOT EXISTS crm_activities (${HEAD}
        kind text,
        subject text,
        occurred_at timestamptz,
        done boolean,
        owner_external_id text,
        account_external_id text,
        account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
        contact_external_id text,
        contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
        deal_external_id text,
        CONSTRAINT crm_activities_kind_check CHECK (kind IS NULL OR kind IN (${ACTIVITY_KINDS})),${tail('crm_activities')}
      )`,
}

const RECORD_COLUMNS = [
  `crm_owner_external_id text`,
  `crm_custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb`,
  `crm_updated_at timestamptz`,
  `crm_url text`,
] as const

export class CrmMirror1796560465886 implements MigrationInterface {
  public name = 'CrmMirror1796560465886'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of MIRROR_TABLES) {
      await queryRunner.query(CREATES[table])
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
      await queryRunner.query(`DROP POLICY IF EXISTS "${table}_member_read" ON ${table}`)
      await queryRunner.query(`
        CREATE POLICY "${table}_member_read" ON ${table} FOR SELECT
          USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
      `)
    }

    // La fiche compte lit les affaires et activités DE SON compte ; les lecteurs filtrent les archivées.
    for (const table of ['crm_deals', 'crm_activities'] as const)
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS ${table}_workspace_account_idx ON ${table} (workspace_id, account_id)`,
      )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS crm_activities_workspace_contact_idx ON crm_activities (workspace_id, contact_id)`,
    )
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS crm_stages_pipeline_idx ON crm_stages (pipeline_id)`)

    for (const table of ['accounts', 'contacts'] as const)
      for (const column of RECORD_COLUMNS)
        await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column}`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['accounts', 'contacts'] as const)
      for (const column of ['crm_owner_external_id', 'crm_custom_fields', 'crm_updated_at', 'crm_url'])
        await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS ${column}`)
    for (const table of [...MIRROR_TABLES].reverse()) await queryRunner.query(`DROP TABLE IF EXISTS ${table}`)
  }
}

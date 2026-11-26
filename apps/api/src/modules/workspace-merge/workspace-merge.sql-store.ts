import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import type { DataSource, EntityManager } from 'typeorm'
import type { WorkspaceMergeStatus, WorkspaceMergeTable } from '@bellum/contracts'
import type { DuplicateLookupKeys, MergeAccountRow, MergeContactRow } from './workspace-merge.plan'
import type {
  MergeRecordedItem,
  MergeRequestRecord,
  MergeStep,
  MergeStepResult,
  MergeWorkspaceRow,
  WorkspaceMergeStore,
} from './workspace-merge.store'

/** Même normalisation que `normalizeLinkedin` (workspace-merge.plan.ts). */
const LINKEDIN_SQL = `rtrim(split_part(split_part(regexp_replace(lower(btrim(c.linkedin_url)), '^https?://(www\\.)?', ''), '?', 1), '#', 1), '/')`

/**
 * Les colonnes REMISES À NUL sur la copie : elles désignent un objet de l'espace d'origine (business
 * unit, entité, fusion) ou un envoi déjà fait. Les recopier ferait pointer la cible vers la source.
 */
const NULLED_ON_COPY: Record<WorkspaceMergeTable, readonly string[]> = {
  accounts: ['merged_into_id', 'merged_entity_id', 'business_unit_id'],
  contacts: ['merged_into_id', 'entity_id', 'email_provider_message_id'],
}

const REQUEST_COLUMNS = `id, workspace_id, source_workspace_id, requested_by, status, preview, preview_hash,
  user_validated_at, admin_validated_by, admin_validated_at, rejected_by, rejected_at, started_at, finished_at,
  last_error, created_at`

const WRITABLE_REQUEST_COLUMNS = new Set([
  'workspace_id',
  'status',
  'preview',
  'preview_hash',
  'user_validated_at',
  'admin_validated_by',
  'admin_validated_at',
  'rejected_by',
  'rejected_at',
  'started_at',
  'finished_at',
  'last_error',
])

type WorkspaceSqlRow = {
  id: string
  name: string
  owner_user_id: string
  is_demo: boolean
  archived_at: Date | null
  member_count: string | number
}

/**
 * #4158.57 — l'adaptateur SQL du rapatriement. Chaque requête de DONNÉES porte `workspace_id = $n` avec
 * l'espace source (lecture) ou cible (ajout) : jamais une liste d'espaces, jamais un UPDATE d'une ligne
 * existante de `accounts` / `contacts`. La copie reprend toutes les colonnes de la ligne d'origine (lues au
 * catalogue), avec un nouvel identifiant et l'espace cible.
 */
@Injectable()
export class SqlWorkspaceMergeStore implements WorkspaceMergeStore {
  private readonly columns = new Map<WorkspaceMergeTable, string[]>()

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async personalWorkspaceOf(userId: string): Promise<MergeWorkspaceRow | null> {
    const rows = await this.dataSource.query<WorkspaceSqlRow[]>(
      `SELECT w.id, w.name, w.owner_user_id, w.is_demo, w.archived_at,
              (SELECT count(*) FROM workspace_members m WHERE m.workspace_id = w.id) AS member_count
         FROM workspaces w
        WHERE w.owner_user_id = $1 AND w.is_demo = false AND w.archived_at IS NULL
        ORDER BY w.created_at ASC`,
      [userId],
    )
    const personal = rows.map(toWorkspace).find(row => row.memberCount <= 1)
    return personal ?? null
  }

  async workspace(workspaceId: string): Promise<MergeWorkspaceRow | null> {
    const rows = await this.dataSource.query<WorkspaceSqlRow[]>(
      `SELECT w.id, w.name, w.owner_user_id, w.is_demo, w.archived_at,
              (SELECT count(*) FROM workspace_members m WHERE m.workspace_id = w.id) AS member_count
         FROM workspaces w WHERE w.id = $1`,
      [workspaceId],
    )
    return rows[0] ? toWorkspace(rows[0]) : null
  }

  async roleIn(userId: string, workspaceId: string): Promise<string | null> {
    const rows = await this.dataSource.query<{ role: string }[]>(
      `SELECT role FROM workspace_members WHERE user_id = $1 AND workspace_id = $2`,
      [userId, workspaceId],
    )
    return rows[0]?.role ?? null
  }

  async activeAccounts(workspaceId: string): Promise<MergeAccountRow[]> {
    const rows = await this.dataSource.query<AccountSqlRow[]>(
      `SELECT a.id, a.company_name, a.siren, a.registry_country, a.registry_id
         FROM accounts a
        WHERE a.workspace_id = $1 AND a.merged_into_id IS NULL
          AND COALESCE(a.status, '') NOT IN ('archived', 'deleted')`,
      [workspaceId],
    )
    return rows.map(toAccount)
  }

  async activeContacts(workspaceId: string): Promise<MergeContactRow[]> {
    const rows = await this.dataSource.query<ContactSqlRow[]>(
      `SELECT c.id, c.full_name, c.account_id, c.email, c.linkedin_url
         FROM contacts c
        WHERE c.workspace_id = $1 AND c.deleted_at IS NULL AND c.merged_into_id IS NULL`,
      [workspaceId],
    )
    return rows.map(toContact)
  }

  async targetDuplicates(
    workspaceId: string,
    keys: DuplicateLookupKeys,
  ): Promise<{ accounts: MergeAccountRow[]; contacts: MergeContactRow[] }> {
    const accounts = await this.dataSource.query<AccountSqlRow[]>(
      `SELECT a.id, a.company_name, a.siren, a.registry_country, a.registry_id
         FROM accounts a
        WHERE a.workspace_id = $1 AND a.merged_into_id IS NULL
          AND COALESCE(a.status, '') NOT IN ('archived', 'deleted')
          AND (
            regexp_replace(COALESCE(a.siren, ''), '\\s', '', 'g') = ANY($2::text[])
            OR (upper(btrim(COALESCE(a.registry_country, ''))) || '|' || btrim(COALESCE(a.registry_id, ''))) = ANY($3::text[])
          )`,
      [workspaceId, keys.sirens, keys.registries.map(r => `${r.country}|${r.id}`)],
    )
    const contacts = await this.dataSource.query<ContactSqlRow[]>(
      `SELECT c.id, c.full_name, c.account_id, c.email, c.linkedin_url
         FROM contacts c
        WHERE c.workspace_id = $1 AND c.deleted_at IS NULL AND c.merged_into_id IS NULL
          AND (lower(btrim(COALESCE(c.email, ''))) = ANY($2::text[]) OR ${LINKEDIN_SQL} = ANY($3::text[]))`,
      [workspaceId, keys.emails, keys.linkedins],
    )
    return { accounts: accounts.map(toAccount), contacts: contacts.map(toContact) }
  }

  async liveRequestForSource(sourceWorkspaceId: string): Promise<MergeRequestRecord | null> {
    const rows = await this.dataSource.query<MergeRequestRecord[]>(
      `SELECT ${REQUEST_COLUMNS} FROM workspace_merge_requests
        WHERE source_workspace_id = $1 AND status IN ('previewed', 'awaiting_admin', 'approved', 'running', 'failed')`,
      [sourceWorkspaceId],
    )
    return rows[0] ?? null
  }

  async findRequest(requestId: string): Promise<MergeRequestRecord | null> {
    const rows = await this.dataSource.query<MergeRequestRecord[]>(
      `SELECT ${REQUEST_COLUMNS} FROM workspace_merge_requests WHERE id = $1`,
      [requestId],
    )
    return rows[0] ?? null
  }

  async requestsForTarget(
    workspaceId: string,
    statuses: readonly WorkspaceMergeStatus[],
  ): Promise<MergeRequestRecord[]> {
    return this.dataSource.query<MergeRequestRecord[]>(
      `SELECT ${REQUEST_COLUMNS} FROM workspace_merge_requests
        WHERE workspace_id = $1 AND status = ANY($2::text[]) ORDER BY created_at DESC`,
      [workspaceId, [...statuses]],
    )
  }

  async requestsBy(userId: string): Promise<MergeRequestRecord[]> {
    return this.dataSource.query<MergeRequestRecord[]>(
      `SELECT ${REQUEST_COLUMNS} FROM workspace_merge_requests
        WHERE requested_by = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId],
    )
  }

  async insertRequest(record: Omit<MergeRequestRecord, 'id' | 'created_at'>): Promise<MergeRequestRecord> {
    const rows = await this.dataSource.query<MergeRequestRecord[]>(
      `INSERT INTO workspace_merge_requests
         (workspace_id, source_workspace_id, requested_by, status, preview, preview_hash, user_validated_at,
          admin_validated_by, admin_validated_at, rejected_by, rejected_at, started_at, finished_at, last_error)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING ${REQUEST_COLUMNS}`,
      [
        record.workspace_id,
        record.source_workspace_id,
        record.requested_by,
        record.status,
        JSON.stringify(record.preview),
        record.preview_hash,
        record.user_validated_at,
        record.admin_validated_by,
        record.admin_validated_at,
        record.rejected_by,
        record.rejected_at,
        record.started_at,
        record.finished_at,
        record.last_error,
      ],
    )
    return rows[0]!
  }

  async updateRequest(requestId: string, patch: Partial<Omit<MergeRequestRecord, 'id'>>): Promise<void> {
    const entries = Object.entries(patch).filter(([column]) => WRITABLE_REQUEST_COLUMNS.has(column))
    if (entries.length === 0) return
    const assignments = entries.map(([column], i) =>
      column === 'preview' ? `${column} = $${i + 2}::jsonb` : `${column} = $${i + 2}`,
    )
    const values = entries.map(([column, value]) => (column === 'preview' ? JSON.stringify(value) : value))
    await this.dataSource.query(
      `UPDATE workspace_merge_requests SET ${assignments.join(', ')}, updated_at = now() WHERE id = $1`,
      [requestId, ...values],
    )
  }

  async recordedItems(requestId: string, workspaceId: string): Promise<MergeRecordedItem[]> {
    const rows = await this.dataSource.query<
      { source_table: WorkspaceMergeTable; source_id: string; target_id: string | null; outcome: string }[]
    >(
      `SELECT source_table, source_id, target_id, outcome FROM workspace_merge_items
        WHERE request_id = $1 AND workspace_id = $2`,
      [requestId, workspaceId],
    )
    return rows.map(row => ({
      table: row.source_table,
      sourceId: row.source_id,
      targetId: row.target_id,
      outcome: row.outcome as MergeRecordedItem['outcome'],
    }))
  }

  async applyStep(step: MergeStep): Promise<MergeStepResult> {
    const columns = await this.columnsOf(step.table)
    return this.dataSource
      .transaction(async manager => {
        const claimed = await manager.query<{ id: string }[]>(
          `INSERT INTO workspace_merge_items (request_id, workspace_id, source_table, source_id, target_id, outcome)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (request_id, source_table, source_id) DO NOTHING
         RETURNING id`,
          [step.requestId, step.targetWorkspaceId, step.table, step.sourceId, step.targetId, step.outcome],
        )
        if (claimed.length === 0) return { state: 'already' } as const
        if (step.outcome !== 'copied') return { state: 'written', targetId: step.targetId } as const

        const copyId = await this.copyRow(manager, step, columns)
        // La ligne d'origine a quitté l'espace source : on annule la ligne de journal avec la transaction.
        if (!copyId) throw new MissingSourceRow()
        await manager.query(`UPDATE workspace_merge_items SET target_id = $1 WHERE id = $2 AND workspace_id = $3`, [
          copyId,
          claimed[0]!.id,
          step.targetWorkspaceId,
        ])
        return { state: 'written', targetId: copyId } as const
      })
      .catch((error: unknown) => {
        if (error instanceof MissingSourceRow) return { state: 'missing' } as const
        throw error
      })
  }

  async archiveSource(sourceWorkspaceId: string, targetWorkspaceId: string, ownerUserId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE workspaces SET archived_at = COALESCE(archived_at, now()), merged_into_workspace_id = $2
        WHERE id = $1 AND owner_user_id = $3`,
      [sourceWorkspaceId, targetWorkspaceId, ownerUserId],
    )
  }

  async selectActiveWorkspace(userId: string, workspaceId: string): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO workspace_active_selections (user_id, workspace_id, updated_at)
       SELECT $1, $2, now() WHERE EXISTS (
         SELECT 1 FROM workspace_members m WHERE m.user_id = $1 AND m.workspace_id = $2
       )
       ON CONFLICT (user_id) DO UPDATE SET workspace_id = EXCLUDED.workspace_id, updated_at = now()`,
      [userId, workspaceId],
    )
  }

  /**
   * La copie : toutes les colonnes de la ligne d'origine, un nouvel identifiant, l'espace CIBLE, et pour un
   * contact la copie de son compte. Lue avec `workspace_id = $source` — une ligne d'un autre espace ne
   * se copie jamais, même si on en donnait l'identifiant.
   */
  private async copyRow(manager: EntityManager, step: MergeStep, columns: string[]): Promise<string | null> {
    const nulled = new Set(NULLED_ON_COPY[step.table])
    const params: unknown[] = [step.sourceId, step.sourceWorkspaceId, step.targetWorkspaceId]
    if (step.table === 'contacts') params.push(step.targetAccountId)
    const select = columns.map(column => {
      if (column === 'id') return 'gen_random_uuid()'
      if (column === 'workspace_id') return '$3::uuid'
      if (step.table === 'contacts' && column === 'account_id') return '$4::uuid'
      if (nulled.has(column)) return 'NULL'
      return `src."${column}"`
    })
    const list = columns.map(column => `"${column}"`).join(', ')
    const rows =
      step.table === 'accounts'
        ? await manager.query<{ id: string }[]>(
            `INSERT INTO accounts (${list}) SELECT ${select.join(', ')} FROM accounts src
              WHERE src.id = $1 AND src.workspace_id = $2 RETURNING id`,
            params,
          )
        : await manager.query<{ id: string }[]>(
            `INSERT INTO contacts (${list}) SELECT ${select.join(', ')} FROM contacts src
              WHERE src.id = $1 AND src.workspace_id = $2 RETURNING id`,
            params,
          )
    return rows[0]?.id ?? null
  }

  /** Les colonnes INSÉRABLES de la table (ni générées, ni identité), lues une fois au catalogue. */
  private async columnsOf(table: WorkspaceMergeTable): Promise<string[]> {
    const cached = this.columns.get(table)
    if (cached) return cached
    const rows = await this.dataSource.query<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND is_generated = 'NEVER' AND is_identity = 'NO'
        ORDER BY ordinal_position`,
      [table],
    )
    const columns = rows.map(row => row.column_name).filter(name => /^[a-z_][a-z0-9_]*$/.test(name))
    this.columns.set(table, columns)
    return columns
  }
}

class MissingSourceRow extends Error {}

type AccountSqlRow = {
  id: string
  company_name: string | null
  siren: string | null
  registry_country: string | null
  registry_id: string | null
}
type ContactSqlRow = {
  id: string
  full_name: string | null
  account_id: string | null
  email: string | null
  linkedin_url: string | null
}

function toWorkspace(row: WorkspaceSqlRow): MergeWorkspaceRow {
  return {
    id: row.id,
    name: row.name,
    ownerUserId: row.owner_user_id,
    isDemo: row.is_demo,
    archivedAt: row.archived_at,
    memberCount: Number(row.member_count),
  }
}

function toAccount(row: AccountSqlRow): MergeAccountRow {
  return {
    id: row.id,
    label: row.company_name ?? '',
    siren: row.siren,
    registryCountry: row.registry_country,
    registryId: row.registry_id,
  }
}

function toContact(row: ContactSqlRow): MergeContactRow {
  return {
    id: row.id,
    label: row.full_name ?? '',
    accountId: row.account_id,
    email: row.email,
    linkedin: row.linkedin_url,
  }
}

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import type { CrmProvider } from '@bellum/contracts'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { CrmDealEntity } from '../../database/entities/crm-mirror.entity'

export type MirrorTable = 'crm_owners' | 'crm_pipelines' | 'crm_stages' | 'crm_deals' | 'crm_activities'

/** Une ligne à écrire : colonnes SQL de la table (la clé d'upsert est toujours présente). */
export type MirrorRow = { external_id: string } & Record<string, unknown>

/**
 * SYNC-A — la SEULE porte d'écriture du miroir CRM (tables `crm_*` de la migration
 * `1796560465886-CrmMirror`). La logique (lecture bornée, liens, archivage) vit dans
 * `CrmMirrorService` ; ici, le SQL, et chaque requête est bornée par l'espace ET le fournisseur.
 */
export interface CrmMirrorStore {
  /** L'utilisateur qui porte la connexion de ce CRM dans cet espace ; `null` = rien de branché. */
  connectionUser(workspaceId: string, provider: CrmProvider): Promise<string | null>
  /** Les liens Bellum ↔ CRM déjà posés (`sync_links`) : identifiant externe → compte / contact. */
  links(
    workspaceId: string,
    provider: CrmProvider,
  ): Promise<{ accounts: ReadonlyMap<string, string>; contacts: ReadonlyMap<string, string> }>
  /** Les fiches modifiées DANS Bellum depuis leur dernière copie (`updated_at > synced_at`). */
  humanEdited(
    table: MirrorTable,
    workspaceId: string,
    provider: CrmProvider,
    externalIds: readonly string[],
  ): Promise<ReadonlySet<string>>
  upsert(table: MirrorTable, rows: readonly MirrorRow[]): Promise<void>
  /** Pipeline externe → uuid Bellum (une étape s'écrit sous son pipeline). */
  pipelineIds(workspaceId: string, provider: CrmProvider): Promise<ReadonlyMap<string, string>>
  /** Étape externe → libellé (une affaire qui ne rend que l'identifiant d'étape). */
  stageLabels(workspaceId: string, provider: CrmProvider): Promise<ReadonlyMap<string, string | null>>
  /** Affaire externe → compte Bellum (une activité liée à une affaire hérite de son compte). */
  dealAccounts(workspaceId: string, provider: CrmProvider): Promise<ReadonlyMap<string, string>>
  /** Archive (jamais DELETE) ce qui n'a pas été relu ; rend le nombre de fiches archivées. */
  archiveMissing(
    table: MirrorTable,
    workspaceId: string,
    provider: CrmProvider,
    seen: readonly string[],
  ): Promise<number>
}

export const CRM_MIRROR_STORE = Symbol('CRM_MIRROR_STORE')

/** Colonnes JSON / tableau : sérialisées explicitement pour le pilote. */
const JSON_COLUMNS = new Set(['crm_custom_fields'])
const ARRAY_COLUMNS = new Set(['contact_external_ids'])
const UPSERT_CHUNK = 200

@Injectable()
export class SqlCrmMirrorStore implements CrmMirrorStore {
  constructor(
    @InjectRepository(CrmDealEntity) private readonly deals: Repository<CrmDealEntity>,
    @InjectRepository(CrmConnectionEntity) private readonly connections: Repository<CrmConnectionEntity>,
  ) {}

  private get query() {
    return this.deals.manager.query.bind(this.deals.manager) as <T>(sql: string, params?: unknown[]) => Promise<T>
  }

  async connectionUser(workspaceId: string, provider: CrmProvider): Promise<string | null> {
    const row = await this.connections.findOne({ where: { workspace_id: workspaceId, provider } })
    return row?.user_id ?? null
  }

  async links(workspaceId: string, provider: CrmProvider) {
    const rows = await this.query<Array<{ entity_type: string; external_id: string; internal_id: string }>>(
      `SELECT entity_type, external_id, internal_id FROM sync_links
        WHERE workspace_id = $1 AND provider = $2 AND entity_type IN ('account', 'contact')`,
      [workspaceId, provider],
    )
    const of = (type: string) =>
      new Map(rows.filter(row => row.entity_type === type).map(row => [row.external_id, row.internal_id] as const))
    return { accounts: of('account'), contacts: of('contact') }
  }

  async humanEdited(table: MirrorTable, workspaceId: string, provider: CrmProvider, externalIds: readonly string[]) {
    if (externalIds.length === 0) return new Set<string>()
    const rows = await this.query<Array<{ external_id: string }>>(
      `SELECT external_id FROM ${table}
        WHERE workspace_id = $1 AND provider = $2 AND external_id = ANY($3::text[]) AND updated_at > synced_at`,
      [workspaceId, provider, [...externalIds]],
    )
    return new Set(rows.map(row => row.external_id))
  }

  async upsert(table: MirrorTable, rows: readonly MirrorRow[]): Promise<void> {
    for (let start = 0; start < rows.length; start += UPSERT_CHUNK) {
      const chunk = rows.slice(start, start + UPSERT_CHUNK)
      const columns = Object.keys(chunk[0] ?? {})
      if (columns.length === 0) continue
      const params: unknown[] = []
      const values = chunk.map(row => {
        const cells = columns.map(column => {
          const value = row[column] ?? null
          params.push(JSON_COLUMNS.has(column) ? JSON.stringify(value ?? {}) : value)
          const cast = JSON_COLUMNS.has(column) ? '::jsonb' : ARRAY_COLUMNS.has(column) ? '::text[]' : ''
          return `$${params.length}${cast}`
        })
        return `(${cells.join(', ')})`
      })
      const updates = columns
        .filter(column => !['workspace_id', 'provider', 'external_id'].includes(column))
        .map(column => `${column} = EXCLUDED.${column}`)
      await this.query(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values.join(', ')}
         ON CONFLICT (workspace_id, provider, external_id) DO UPDATE SET ${updates.join(', ')}`,
        params,
      )
    }
  }

  async pipelineIds(workspaceId: string, provider: CrmProvider) {
    const rows = await this.query<Array<{ id: string; external_id: string }>>(
      `SELECT id, external_id FROM crm_pipelines WHERE workspace_id = $1 AND provider = $2`,
      [workspaceId, provider],
    )
    return new Map(rows.map(row => [row.external_id, row.id] as const))
  }

  async stageLabels(workspaceId: string, provider: CrmProvider) {
    const rows = await this.query<Array<{ external_id: string; label: string | null }>>(
      `SELECT external_id, label FROM crm_stages WHERE workspace_id = $1 AND provider = $2`,
      [workspaceId, provider],
    )
    return new Map(rows.map(row => [row.external_id, row.label] as const))
  }

  async dealAccounts(workspaceId: string, provider: CrmProvider) {
    const rows = await this.query<Array<{ external_id: string; account_id: string }>>(
      `SELECT external_id, account_id FROM crm_deals
        WHERE workspace_id = $1 AND provider = $2 AND account_id IS NOT NULL`,
      [workspaceId, provider],
    )
    return new Map(rows.map(row => [row.external_id, row.account_id] as const))
  }

  async archiveMissing(table: MirrorTable, workspaceId: string, provider: CrmProvider, seen: readonly string[]) {
    const result = await this.query<[unknown[], number]>(
      `UPDATE ${table} SET archived_at = now(), updated_at = now(), synced_at = now()
        WHERE workspace_id = $1 AND provider = $2 AND archived_at IS NULL AND NOT (external_id = ANY($3::text[]))`,
      [workspaceId, provider, [...seen]],
    )
    return Array.isArray(result) && typeof result[1] === 'number' ? result[1] : 0
  }
}

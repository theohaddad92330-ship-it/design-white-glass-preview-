import { Injectable, Logger } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { returnedRows } from '../../database/returned-rows'
import { CrmAdapterRegistry } from './adapter/crm-adapter.registry'
import { adapterAccountSource, adapterContactSource } from './crm-sources'

/** Fiches lues d'un coup pour décider qu'une absence est une VRAIE absence. Au-delà : la lecture est tronquée, on n'archive rien. */
const FULL_READ_LIMIT = 10_000
/** Au-delà de cette part de fiches liées « disparues », on suspecte un droit retiré ou un filtre, pas un ménage : rien n'est archivé. */
const MAX_MISSING_SHARE = 0.5
/** En deçà de ce nombre de fiches liées, la part ci-dessus n'a pas de sens (1 fiche sur 2 = 50 %). */
const SHARE_GUARD_FROM = 10

type EntityType = 'account' | 'contact'
type CrmArchiveOutcome = { accounts: number; contacts: number; skipped: string[] }

/**
 * SYNC-C (C.4) — la fiche SUPPRIMÉE côté CRM est ARCHIVÉE dans Bellum, jamais supprimée (doctrine).
 *
 * Une absence ne se déduit QUE d'une lecture complète et non vide : tronquée, en erreur ou vide alors que des
 * fiches sont liées, on n'archive rien et on le dit (`skipped`). Le lien d'import (`sync_links`) d'une fiche
 * archivée est retiré : il ne dit plus « présente dans le CRM », et une correction humaine POSTÉRIEURE
 * (désarchiver) n'est pas défaite la nuit suivante. Compte → `commercial_status = 'archived'` ; contact →
 * `deleted_at` (suppression réversible T0).
 */
@Injectable()
export class CrmDisappearedArchiver {
  private readonly logger = new Logger(CrmDisappearedArchiver.name)

  constructor(
    private readonly adapters: CrmAdapterRegistry,
    private readonly dataSource: DataSource,
  ) {}

  async archiveMissing(userId: string, workspaceId: string, provider: string): Promise<CrmArchiveOutcome> {
    const outcome: CrmArchiveOutcome = { accounts: 0, contacts: 0, skipped: [] }
    const adapter = this.adapters.get(provider)
    if (!adapter?.read) return outcome
    for (const entityType of ['account', 'contact'] as const) {
      try {
        const listed = await this.listIds(userId, adapter, entityType)
        if (listed === null) {
          outcome.skipped.push(`${entityType}: lecture tronquée`)
          continue
        }
        const archived = await this.archive(workspaceId, provider, entityType, listed, outcome)
        if (entityType === 'account') outcome.accounts = archived
        else outcome.contacts = archived
      } catch (error) {
        // Une lecture en échec n'archive rien : l'absence ne se déduit jamais d'une erreur.
        outcome.skipped.push(`${entityType}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return outcome
  }

  /** Les identifiants externes lus, ou `null` si la lecture est tronquée. */
  private async listIds(
    userId: string,
    adapter: NonNullable<ReturnType<CrmAdapterRegistry['get']>>,
    entityType: EntityType,
  ): Promise<Set<string> | null> {
    const page =
      entityType === 'account'
        ? await adapterAccountSource(adapter).listCompanies(userId, FULL_READ_LIMIT)
        : await adapterContactSource(adapter).listContacts(userId, FULL_READ_LIMIT)
    if (page.truncated) return null
    return new Set(page.records.map(record => record.externalId))
  }

  private async archive(
    workspaceId: string,
    provider: string,
    entityType: EntityType,
    listed: ReadonlySet<string>,
    outcome: CrmArchiveOutcome,
  ): Promise<number> {
    const linked = await this.dataSource.query<Array<{ external_id: string; internal_id: string }>>(
      `SELECT external_id, internal_id FROM sync_links WHERE workspace_id = $1 AND provider = $2 AND entity_type = $3`,
      [workspaceId, provider, entityType],
    )
    const missing = linked.filter(link => !listed.has(link.external_id))
    if (missing.length === 0) return 0
    if (
      listed.size === 0 ||
      (linked.length >= SHARE_GUARD_FROM && missing.length / linked.length > MAX_MISSING_SHARE)
    ) {
      outcome.skipped.push(`${entityType}: ${missing.length}/${linked.length} absentes, suspect — rien archivé`)
      this.logger.warn(`Archivage CRM refusé (${provider}/${entityType}): ${missing.length}/${linked.length} absentes`)
      return 0
    }
    const ids = missing.map(link => link.internal_id)
    const archived =
      entityType === 'account'
        ? returnedRows<{ id: string }>(
            await this.dataSource.query(
              `UPDATE accounts SET commercial_status = 'archived'
              WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND commercial_status <> 'archived' RETURNING id`,
              [workspaceId, ids],
            ),
          )
        : returnedRows<{ id: string }>(
            await this.dataSource.query(
              `UPDATE contacts SET deleted_at = now()
              WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL RETURNING id`,
              [workspaceId, ids],
            ),
          )
    await this.dataSource.query(
      `DELETE FROM sync_links
        WHERE workspace_id = $1 AND provider = $2 AND entity_type = $3 AND external_id = ANY($4::text[])`,
      [workspaceId, provider, entityType, missing.map(link => link.external_id)],
    )
    this.logger.log(`CRM ${provider}: ${archived.length} ${entityType}(s) archivée(s), absentes du CRM`)
    return archived.length
  }
}

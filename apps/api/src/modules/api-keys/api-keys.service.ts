import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomBytes } from 'node:crypto'
import { IsNull, Repository } from 'typeorm'
import { ApiKeyEntity } from '../../database/entities/api-key.entity'
import type { PublicApiScope } from './api-key.scopes'

/** Every raw key starts with this — makes a leaked key greppable/revocable and
 *  lets the guard reject non-key bearers before touching the database. */
export const API_KEY_PREFIX = 'blm_live_'

/** Non-sensitive display form: `blm_live_` + the first 4 secret characters. */
const DISPLAY_PREFIX_CHARS = 4

/** What the settings screen sees — NEVER includes `key_hash`. */
export type ApiKeySummary = {
  id: string
  name: string
  prefix: string
  scopes: string[]
  last_used_at: Date | null
  revoked_at: Date | null
  created_at: Date
}

/** Creation response: the summary + the raw key, shown exactly once. */
export type CreatedApiKey = ApiKeySummary & { key: string }

/** The principal an authenticated `/v1` request acts as. */
export type ApiKeyPrincipal = {
  keyId: string
  workspaceId: string
  scopes: string[]
}

function toSummary(row: ApiKeyEntity): ApiKeySummary {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes ?? [],
    last_used_at: row.last_used_at,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
  }
}

/**
 * Owns the `api_keys` table. Hash-only invariant lives HERE: the raw key is
 * minted in {@link create}, returned to the caller, and only its SHA-256 hex
 * is handed to the repository. No method ever returns or logs `key_hash`.
 */
@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKeyEntity)
    private readonly keys: Repository<ApiKeyEntity>,
  ) {}

  /** SHA-256 hex of a raw key — the only representation that touches the DB. */
  hashKey(raw: string): string {
    return createHash('sha256').update(raw).digest('hex')
  }

  /**
   * Mint a key for the workspace. The returned `key` is the ONLY time the raw
   * value exists outside the caller's hands — the row stores its hash.
   */
  async create(input: {
    workspaceId: string
    createdBy: string
    name: string
    scopes: PublicApiScope[]
  }): Promise<CreatedApiKey> {
    const secret = randomBytes(32).toString('base64url')
    const key = `${API_KEY_PREFIX}${secret}`
    const row = await this.keys.save(
      this.keys.create({
        workspace_id: input.workspaceId,
        name: input.name,
        key_hash: this.hashKey(key),
        prefix: `${API_KEY_PREFIX}${secret.slice(0, DISPLAY_PREFIX_CHARS)}`,
        scopes: [...new Set(input.scopes)],
        created_by: input.createdBy,
      }),
    )
    return { ...toSummary(row), key }
  }

  /** All the workspace's keys (revoked included, for audit), newest first. */
  async list(workspaceId: string): Promise<ApiKeySummary[]> {
    const rows = await this.keys.find({
      where: { workspace_id: workspaceId },
      order: { created_at: 'DESC' },
    })
    return rows.map(toSummary)
  }

  /**
   * Soft-revoke a key. Scoped by workspace so a member can never revoke
   * another workspace's key — an id outside the workspace reads as not-found.
   * Idempotent: revoking twice keeps the first `revoked_at`.
   */
  async revoke(workspaceId: string, id: string): Promise<void> {
    const row = await this.keys.findOne({ where: { id, workspace_id: workspaceId } })
    if (!row) throw new NotFoundException('Clé API introuvable')
    if (row.revoked_at) return
    await this.keys.update({ id: row.id }, { revoked_at: new Date() })
  }

  /**
   * Guard lookup: raw bearer value → active key row, or `null`. Only ACTIVE
   * keys match (`revoked_at IS NULL`) — revocation is effective on the very
   * next request. The raw value is hashed here and never stored/logged.
   */
  async findActiveByRawKey(raw: string): Promise<ApiKeyEntity | null> {
    if (!raw.startsWith(API_KEY_PREFIX)) return null
    return this.keys.findOne({ where: { key_hash: this.hashKey(raw), revoked_at: IsNull() } })
  }

  /** Best-effort `last_used_at` stamp — never blocks nor fails the request. */
  touchLastUsed(id: string): void {
    void this.keys.update({ id }, { last_used_at: new Date() }).catch(() => undefined)
  }
}

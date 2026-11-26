import { NotFoundException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import type { FindOperator, Repository } from 'typeorm'
import { ApiKeyEntity } from '../../database/entities/api-key.entity'
import { API_KEY_PREFIX, ApiKeysService } from './api-keys.service'

type Where = Partial<Record<keyof ApiKeyEntity, unknown>>

/** In-memory `api_keys` table — enough of the Repository surface for the service. */
function makeFakeRepo(): { repo: Repository<ApiKeyEntity>; rows: ApiKeyEntity[] } {
  const rows: ApiKeyEntity[] = []
  let seq = 0

  const matches = (row: ApiKeyEntity, where: Where): boolean =>
    Object.entries(where).every(([field, expected]) => {
      const actual = row[field as keyof ApiKeyEntity]
      // The service queries `revoked_at: IsNull()`.
      if (typeof expected === 'object' && expected !== null && '_type' in (expected as FindOperator<unknown>)) {
        return actual === null
      }
      return actual === expected
    })

  const repo = {
    create: (input: Partial<ApiKeyEntity>) => input as ApiKeyEntity,
    save: async (input: Partial<ApiKeyEntity>) => {
      const row: ApiKeyEntity = {
        id: `key-${++seq}`,
        last_used_at: null,
        revoked_at: null,
        created_at: new Date('2026-07-16T10:00:00Z'),
        ...input,
      } as ApiKeyEntity
      rows.push(row)
      return row
    },
    find: async ({ where }: { where: Where }) => rows.filter(row => matches(row, where)),
    findOne: async ({ where }: { where: Where }) => rows.find(row => matches(row, where)) ?? null,
    update: async (criteria: Where, patch: Partial<ApiKeyEntity>) => {
      for (const row of rows.filter(row => matches(row, criteria))) Object.assign(row, patch)
      return { affected: 1 }
    },
  } as unknown as Repository<ApiKeyEntity>

  return { repo, rows }
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

describe('ApiKeysService', () => {
  function setup() {
    const { repo, rows } = makeFakeRepo()
    return { svc: new ApiKeysService(repo), rows }
  }

  describe('create — hash-only invariant', () => {
    it('returns the raw key once and stores ONLY its SHA-256 (never the raw value)', async () => {
      const { svc, rows } = setup()
      const created = await svc.create({
        workspaceId: 'ws-1',
        createdBy: 'user-1',
        name: 'Zapier prod',
        scopes: ['read:accounts'],
      })

      expect(created.key).toMatch(/^blm_live_[A-Za-z0-9_-]{43}$/)
      expect(rows).toHaveLength(1)
      const stored = rows[0] as unknown as Record<string, unknown>
      // The stored hash is the sha256 of the returned key…
      expect(stored['key_hash']).toBe(sha256(created.key))
      // …and no persisted field contains the raw key (or its secret part).
      const secretPart = created.key.slice(API_KEY_PREFIX.length)
      for (const value of Object.values(stored)) {
        if (typeof value !== 'string') continue
        expect(value).not.toBe(created.key)
        expect(value.includes(secretPart)).toBe(false)
      }
    })

    it('stores a displayable prefix (blm_live_ + 4 chars) matching the raw key', async () => {
      const { svc, rows } = setup()
      const created = await svc.create({
        workspaceId: 'ws-1',
        createdBy: 'user-1',
        name: 'k',
        scopes: ['read:accounts', 'read:contacts'],
      })
      expect(created.prefix).toBe(created.key.slice(0, API_KEY_PREFIX.length + 4))
      expect(rows[0]?.prefix).toBe(created.prefix)
      // The 4-char hint is not enough to reconstruct the 43-char secret.
      expect(created.prefix.length).toBeLessThan(created.key.length - 30)
    })

    it('two keys never collide (fresh 256-bit secret each time)', async () => {
      const { svc } = setup()
      const a = await svc.create({ workspaceId: 'ws-1', createdBy: 'u', name: 'a', scopes: ['read:accounts'] })
      const b = await svc.create({ workspaceId: 'ws-1', createdBy: 'u', name: 'b', scopes: ['read:accounts'] })
      expect(a.key).not.toBe(b.key)
    })

    it('dedups scopes', async () => {
      const { svc } = setup()
      const created = await svc.create({
        workspaceId: 'ws-1',
        createdBy: 'u',
        name: 'k',
        scopes: ['read:accounts', 'read:accounts'],
      })
      expect(created.scopes).toEqual(['read:accounts'])
    })
  })

  describe('list', () => {
    it('returns only the workspace’s keys and NEVER the hash', async () => {
      const { svc } = setup()
      await svc.create({ workspaceId: 'ws-1', createdBy: 'u1', name: 'mine', scopes: ['read:accounts'] })
      await svc.create({ workspaceId: 'ws-2', createdBy: 'u2', name: 'theirs', scopes: ['read:accounts'] })

      const listed = await svc.list('ws-1')
      expect(listed).toHaveLength(1)
      expect(listed[0]?.name).toBe('mine')
      expect(listed[0]).not.toHaveProperty('key_hash')
      expect(listed[0]).not.toHaveProperty('key')
    })
  })

  describe('revoke — strict workspace scoping', () => {
    it('revokes an owned key (soft flag)', async () => {
      const { svc, rows } = setup()
      const created = await svc.create({ workspaceId: 'ws-1', createdBy: 'u', name: 'k', scopes: ['read:accounts'] })
      await svc.revoke('ws-1', created.id)
      expect(rows[0]?.revoked_at).toBeInstanceOf(Date)
    })

    it("refuses to revoke another workspace's key (404, row untouched)", async () => {
      const { svc, rows } = setup()
      const created = await svc.create({ workspaceId: 'ws-1', createdBy: 'u', name: 'k', scopes: ['read:accounts'] })
      await expect(svc.revoke('ws-2', created.id)).rejects.toBeInstanceOf(NotFoundException)
      expect(rows[0]?.revoked_at).toBeNull()
    })

    it('is idempotent (keeps the first revoked_at)', async () => {
      const { svc, rows } = setup()
      const created = await svc.create({ workspaceId: 'ws-1', createdBy: 'u', name: 'k', scopes: ['read:accounts'] })
      await svc.revoke('ws-1', created.id)
      const first = rows[0]?.revoked_at
      await svc.revoke('ws-1', created.id)
      expect(rows[0]?.revoked_at).toBe(first)
    })
  })

  describe('findActiveByRawKey', () => {
    it('resolves an active key from its raw value', async () => {
      const { svc } = setup()
      const created = await svc.create({ workspaceId: 'ws-1', createdBy: 'u', name: 'k', scopes: ['read:accounts'] })
      const row = await svc.findActiveByRawKey(created.key)
      expect(row?.id).toBe(created.id)
      expect(row?.workspace_id).toBe('ws-1')
    })

    it('returns null for an unknown key', async () => {
      const { svc } = setup()
      await svc.create({ workspaceId: 'ws-1', createdBy: 'u', name: 'k', scopes: ['read:accounts'] })
      expect(await svc.findActiveByRawKey(`${API_KEY_PREFIX}definitely-not-a-real-secret-value-000000`)).toBeNull()
    })

    it('returns null for a revoked key (revocation is immediate)', async () => {
      const { svc } = setup()
      const created = await svc.create({ workspaceId: 'ws-1', createdBy: 'u', name: 'k', scopes: ['read:accounts'] })
      await svc.revoke('ws-1', created.id)
      expect(await svc.findActiveByRawKey(created.key)).toBeNull()
    })

    it('rejects a value without the blm_live_ prefix without touching the DB', async () => {
      const { svc } = setup()
      expect(await svc.findActiveByRawKey('sk-something-else')).toBeNull()
    })
  })
})

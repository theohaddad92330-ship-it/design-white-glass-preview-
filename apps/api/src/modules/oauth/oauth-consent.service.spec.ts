import { BadRequestException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { Repository } from 'typeorm'
import { OAuthConsentEntity } from '../../database/entities/oauth-consent.entity'
import { OAuthConsentService, isScopeCovered, parseScope } from './oauth-consent.service'

const config = {
  get: (key: string) =>
    key === 'mcpOauthSigningKey'
      ? 'consent-signing-key-16+chars'
      : key === 'apiPublicUrl'
        ? 'https://api.test'
        : undefined,
} as unknown as ConfigService

function makeService(repo?: Partial<Repository<OAuthConsentEntity>>): OAuthConsentService {
  const base = {
    findOne: async () => null,
    find: async () => [],
    insert: async () => ({}),
    update: async () => ({ affected: 1 }),
  }
  return new OAuthConsentService({ ...base, ...repo } as unknown as Repository<OAuthConsentEntity>, config)
}

describe('scope helpers', () => {
  it('parseScope splits + trims', () => {
    expect(parseScope('  mcp:read   mcp:analysis ')).toEqual(['mcp:read', 'mcp:analysis'])
  })
  it('isScopeCovered is true only when every requested scope is granted', () => {
    expect(isScopeCovered('mcp:read mcp:analysis', 'mcp:read')).toBe(true)
    expect(isScopeCovered('mcp:read', 'mcp:read mcp:analysis')).toBe(false)
  })
})

describe('OAuthConsentService consent token (CSRF)', () => {
  it('round-trips user/client/scope', () => {
    const svc = makeService()
    const token = svc.signConsentToken('user-1', 'client-1', 'mcp:read')
    expect(svc.verifyConsentToken(token)).toEqual({ userId: 'user-1', clientId: 'client-1', scope: 'mcp:read' })
  })

  it('rejects a tampered signature', () => {
    const svc = makeService()
    const token = svc.signConsentToken('user-1', 'client-1', 'mcp:read')
    const tampered = `${token.split('.')[0]}.deadbeef`
    expect(() => svc.verifyConsentToken(tampered)).toThrow(BadRequestException)
  })

  it('rejects a malformed token', () => {
    const svc = makeService()
    expect(() => svc.verifyConsentToken('garbage')).toThrow(BadRequestException)
  })

  it('cannot be forged with a different signing key', () => {
    const svc = makeService()
    const token = svc.signConsentToken('user-1', 'client-1', 'mcp:read')
    const otherConfig = { get: () => 'a-totally-different-signing-key' } as unknown as ConfigService
    const otherSvc = new OAuthConsentService({} as unknown as Repository<OAuthConsentEntity>, otherConfig)
    expect(() => otherSvc.verifyConsentToken(token)).toThrow(BadRequestException)
  })
})

describe('OAuthConsentService.grantConsent', () => {
  it('inserts a new grant when none exists', async () => {
    const insert = jest.fn(async () => ({}))
    const svc = makeService({ findOne: async () => null, insert: insert as never })
    await svc.grantConsent('u', 'c', 'mcp:read', 'https://mcp.test')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u', client_id: 'c', scope: 'mcp:read' }))
  })

  it('widens (unions) scope on an existing grant, never narrows', async () => {
    const update = jest.fn(async (_where: unknown, _patch: unknown) => ({ affected: 1 }))
    const existing = { id: 'x1', scope: 'mcp:read' } as OAuthConsentEntity
    const svc = makeService({ findOne: async () => existing, update: update as never })
    await svc.grantConsent('u', 'c', 'mcp:analysis', 'https://mcp.test')
    const patch = update.mock.calls[0][1] as { scope: string }
    expect(parseScope(patch.scope).sort()).toEqual(['mcp:analysis', 'mcp:read'])
  })
})

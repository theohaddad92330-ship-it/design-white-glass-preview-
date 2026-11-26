import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { Repository } from 'typeorm'
import { OAuthAuthorizationCodeEntity } from '../../database/entities/oauth-authorization-code.entity'
import { OAuthRefreshTokenEntity } from '../../database/entities/oauth-refresh-token.entity'
import { OAuthGrantsService } from './oauth-grants.service'
import { OAuthTokensService } from './oauth-tokens.service'

const config = {
  get: (k: string) => (k === 'mcpOauthSigningKey' ? 'grants-signing-key-16+chars' : undefined),
} as unknown as ConfigService

function tokens(): OAuthTokensService {
  return new OAuthTokensService(new JwtService({}), config)
}

const future = () => new Date(Date.now() + 60_000)
const past = () => new Date(Date.now() - 1_000)

describe('OAuthGrantsService.consumeAuthorizationCode', () => {
  function make(codeRepo: Partial<Repository<OAuthAuthorizationCodeEntity>>) {
    const refreshRepo = {} as Repository<OAuthRefreshTokenEntity>
    return new OAuthGrantsService(codeRepo as Repository<OAuthAuthorizationCodeEntity>, refreshRepo, tokens())
  }

  const validRow = {
    id: 'code-1',
    client_id: 'c',
    user_id: 'u',
    redirect_uri: 'https://c/cb',
    scope: 'mcp:read',
    resource: 'https://mcp',
    code_challenge: 'chal',
    code_challenge_method: 'S256',
    used_at: null,
    expires_at: future(),
  } as OAuthAuthorizationCodeEntity

  it('redeems a valid code exactly once', async () => {
    const update = jest.fn(async () => ({ affected: 1 }))
    const svc = make({ findOne: async () => validRow, update: update as never })
    const res = await svc.consumeAuthorizationCode('raw')
    expect(res).toMatchObject({ user_id: 'u', client_id: 'c', code_challenge: 'chal' })
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('returns null for an unknown code', async () => {
    const svc = make({ findOne: async () => null })
    expect(await svc.consumeAuthorizationCode('raw')).toBeNull()
  })

  it('returns null for an already-used code (no update attempted)', async () => {
    const update = jest.fn()
    const svc = make({ findOne: async () => ({ ...validRow, used_at: new Date() }), update: update as never })
    expect(await svc.consumeAuthorizationCode('raw')).toBeNull()
    expect(update).not.toHaveBeenCalled()
  })

  it('returns null for an expired code', async () => {
    const svc = make({ findOne: async () => ({ ...validRow, expires_at: past() }) })
    expect(await svc.consumeAuthorizationCode('raw')).toBeNull()
  })

  it('returns null when it loses the single-use race (affected 0)', async () => {
    const svc = make({ findOne: async () => validRow, update: (async () => ({ affected: 0 })) as never })
    expect(await svc.consumeAuthorizationCode('raw')).toBeNull()
  })
})

describe('OAuthGrantsService.rotateRefreshToken', () => {
  function make(refreshRepo: Partial<Repository<OAuthRefreshTokenEntity>>) {
    const codeRepo = {} as Repository<OAuthAuthorizationCodeEntity>
    return new OAuthGrantsService(codeRepo, refreshRepo as Repository<OAuthRefreshTokenEntity>, tokens())
  }

  const activeRow = {
    id: 'rt-1',
    family_id: 'fam-1',
    client_id: 'c',
    user_id: 'u',
    scope: 'mcp:read',
    resource: 'https://mcp',
    used_at: null,
    revoked_at: null,
    expires_at: future(),
  } as OAuthRefreshTokenEntity

  it('rotates a valid token and returns a successor', async () => {
    const update = jest.fn(async () => ({ affected: 1 }))
    const save = jest.fn(async (x: OAuthRefreshTokenEntity) => ({ ...x, id: 'rt-2' }))
    const svc = make({
      findOne: async () => activeRow,
      update: update as never,
      create: ((x: unknown) => x) as never,
      save: save as never,
    })
    const res = await svc.rotateRefreshToken('raw')
    expect(res.status).toBe('ok')
    if (res.status === 'ok') {
      expect(res.token).toBeTruthy()
      expect(res.clientId).toBe('c')
      expect(res.userId).toBe('u')
    }
  })

  it('detects reuse of an already-rotated token and revokes the family', async () => {
    const update = jest.fn(async () => ({ affected: 1 }))
    const svc = make({ findOne: async () => ({ ...activeRow, used_at: new Date() }), update: update as never })
    const res = await svc.rotateRefreshToken('raw')
    expect(res.status).toBe('reuse_detected')
    // revokeFamily issues an UPDATE against the family.
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ family_id: 'fam-1' }),
      expect.objectContaining({ revoked_at: expect.any(Date) }),
    )
  })

  it('treats a revoked token as reuse', async () => {
    const svc = make({
      findOne: async () => ({ ...activeRow, revoked_at: new Date() }),
      update: (async () => ({ affected: 1 })) as never,
    })
    expect((await svc.rotateRefreshToken('raw')).status).toBe('reuse_detected')
  })

  it('returns invalid for an unknown token', async () => {
    const svc = make({ findOne: async () => null })
    expect((await svc.rotateRefreshToken('raw')).status).toBe('invalid')
  })

  it('returns expired for a past-expiry token', async () => {
    const svc = make({ findOne: async () => ({ ...activeRow, expires_at: past() }) })
    expect((await svc.rotateRefreshToken('raw')).status).toBe('expired')
  })

  it('detects a lost rotation race as reuse', async () => {
    const save = jest.fn(async (x: OAuthRefreshTokenEntity) => ({ ...x, id: 'rt-2' }))
    // First update (rotate) loses the race (affected 0); the follow-up revoke succeeds.
    const update = jest.fn().mockResolvedValueOnce({ affected: 0 }).mockResolvedValue({ affected: 1 })
    const svc = make({
      findOne: async () => activeRow,
      update: update as never,
      create: ((x: unknown) => x) as never,
      save: save as never,
    })
    expect((await svc.rotateRefreshToken('raw')).status).toBe('reuse_detected')
  })
})

import { BadRequestException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { OAuthClientEntity } from '../../database/entities/oauth-client.entity'
import { OAuthClientsService, isAllowedRedirectUri } from './oauth-clients.service'

describe('isAllowedRedirectUri', () => {
  it.each([
    ['https://claude.ai/callback', true],
    ['https://app.example.com/oauth', true],
    ['http://localhost:8080/cb', true],
    ['http://127.0.0.1:33418/callback', true],
    ['cursor://anysphere.cursor-mcp/callback', true],
    ['claude://oauth/callback', true],
  ])('allows %s', (uri, expected) => {
    expect(isAllowedRedirectUri(uri)).toBe(expected)
  })

  it.each([
    ['http://evil.com/cb', false], // non-loopback http
    ['javascript:alert(1)', false],
    ['data:text/html,x', false],
    ['file:///etc/passwd', false],
    ['not a url', false],
    ['', false],
  ])('rejects %s', (uri, expected) => {
    expect(isAllowedRedirectUri(uri)).toBe(expected)
  })
})

describe('OAuthClientsService.register', () => {
  function makeService(): { svc: OAuthClientsService; saved: Partial<OAuthClientEntity>[] } {
    const saved: Partial<OAuthClientEntity>[] = []
    const repo = {
      create: (x: Partial<OAuthClientEntity>) => x,
      save: async (x: Partial<OAuthClientEntity>) => {
        const row = { ...x, created_at: new Date('2026-01-01T00:00:00Z') } as OAuthClientEntity
        saved.push(row)
        return row
      },
    } as unknown as Repository<OAuthClientEntity>
    return { svc: new OAuthClientsService(repo), saved }
  }

  it('registers a public client with a generated client_id and no secret', async () => {
    const { svc } = makeService()
    const res = await svc.register({ redirect_uris: ['https://claude.ai/cb'], client_name: 'Claude' })
    expect(res.client_id).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(res.token_endpoint_auth_method).toBe('none')
    expect(res).not.toHaveProperty('client_secret')
    expect(res.redirect_uris).toEqual(['https://claude.ai/cb'])
    expect(res.grant_types).toEqual(['authorization_code', 'refresh_token'])
  })

  it('rejects when redirect_uris is empty', async () => {
    const { svc } = makeService()
    await expect(svc.register({ redirect_uris: [] })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects a dangerous redirect scheme', async () => {
    const { svc } = makeService()
    await expect(svc.register({ redirect_uris: ['javascript:alert(1)'] })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects more than 10 redirect_uris', async () => {
    const { svc } = makeService()
    const uris = Array.from({ length: 11 }, (_, i) => `https://c${i}.example.com/cb`)
    await expect(svc.register({ redirect_uris: uris })).rejects.toBeInstanceOf(BadRequestException)
  })
})

import { BadRequestException, ServiceUnavailableException } from '@nestjs/common'
import { BeeperService } from './beeper.service'
import { decryptToken } from '../crm/crm-token.crypto'
import type { BeeperConnectionEntity } from '../../database/entities/beeper-connection.entity'
import type { OutboundWriteService } from '../crm/outbound-write.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { BeeperSendGate, BeeperWorkspace } from './beeper-ports'

// Les ports sont COMPATIBLES avec les vrais services que le module branche (`useExisting`) : tsc le prouve.
const portsMatch = (gate: OutboundWriteService, ws: WorkspaceContextService): [BeeperSendGate, BeeperWorkspace] => [
  gate,
  ws,
]
void portsMatch

const BASE = 'https://93.184.216.34'
const SECRET_TOKEN = 'tok-SECRET-access-123'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function build(opts: { demo?: boolean; row?: Partial<BeeperConnectionEntity> | null } = {}) {
  let row: BeeperConnectionEntity | null = opts.row
    ? ({
        id: 'conn-1',
        user_id: 'u1',
        workspace_id: 'ws1',
        base_url: BASE,
        tunnel_declared: false,
        status: 'connected',
        client_id: 'cid',
        client_secret_enc: null,
        authorization_endpoint: `${BASE}/oauth/authorize`,
        token_endpoint: `${BASE}/oauth/token`,
        revocation_endpoint: `${BASE}/oauth/revoke`,
        access_token_enc: null,
        refresh_token_enc: null,
        expires_at: null,
        scope: null,
        created_at: new Date(),
        updated_at: new Date(),
        ...opts.row,
      } as BeeperConnectionEntity)
    : null
  const connections = {
    findOne: jest.fn(async () => row),
    insert: jest.fn(async (patch: Partial<BeeperConnectionEntity>) => {
      row = { id: 'conn-1', ...patch } as BeeperConnectionEntity
    }),
    update: jest.fn(async (_w: unknown, patch: Partial<BeeperConnectionEntity>) => {
      row = { ...(row as BeeperConnectionEntity), ...patch }
    }),
    delete: jest.fn(async () => {
      row = null
    }),
  }
  const qb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn(async () => []),
  }
  const contacts = { createQueryBuilder: jest.fn(() => qb) }
  const workspaceContext = {
    isDemoWorkspace: jest.fn(async () => opts.demo === true),
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws1', role: 'owner' })),
  }
  const outboundWrites = {
    request: jest.fn(async () => ({ decision: 'write_now', request: { id: 'req-1' } })),
    recordOutcome: jest.fn(async () => undefined),
    recordUnknown: jest.fn(async () => undefined),
  }
  const service = new BeeperService(
    connections as never,
    contacts as never,
    workspaceContext as never,
    outboundWrites as never,
  )
  const fetchMock = jest.fn<Promise<Response>, [string, RequestInit?]>()
  service.httpFetch = fetchMock as unknown as typeof fetch
  return { service, connections, outboundWrites, fetchMock, contacts, getRow: () => row }
}

describe('BeeperService (#4406)', () => {
  const env = { ...process.env }
  beforeEach(() => {
    process.env['API_PUBLIC_URL'] = 'https://api.bellum.test'
    process.env['INTERNAL_API_SECRET'] = 'test-internal-secret-0123456789'
  })
  afterEach(() => {
    process.env = { ...env }
  })

  it('sans connexion = no-op strict : aucun appel réseau, état « disconnected »', async () => {
    const { service, fetchMock } = build()
    expect(await service.getStatus('u1')).toMatchObject({ configured: true, state: 'disconnected' })
    expect(await service.listConversations('u1')).toEqual({ state: 'disconnected' })
    expect(await service.readOwnChat('u1', 'c1')).toEqual({ state: 'disconnected' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sans API_PUBLIC_URL : non proposé, aucun appel', async () => {
    delete process.env['API_PUBLIC_URL']
    const { service, fetchMock } = build()
    expect(await service.getStatus('u1')).toMatchObject({ configured: false, state: 'disconnected' })
    await expect(service.register('u1', { baseUrl: BASE, tunnelDeclared: false })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuse http sans tunnel déclaré, et localhost / IP privée même déclarés (garde SSRF côté serveur)', async () => {
    const { service, fetchMock } = build()
    await expect(
      service.register('u1', { baseUrl: 'http://93.184.216.34', tunnelDeclared: false }),
    ).rejects.toBeInstanceOf(BadRequestException)
    for (const baseUrl of ['http://localhost:23373', 'http://127.0.0.1:23373', 'https://192.168.0.10']) {
      await expect(service.register('u1', { baseUrl, tunnelDeclared: true })).rejects.toBeInstanceOf(
        BadRequestException,
      )
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('enregistre : découverte, client dynamique, URL de consentement PKCE S256 liée à l’utilisateur', async () => {
    const { service, fetchMock, getRow } = build()
    fetchMock
      .mockResolvedValueOnce(
        json({
          authorization_endpoint: 'http://localhost:23373/oauth/authorize',
          token_endpoint: '/oauth/token',
          registration_endpoint: '/oauth/register',
          revocation_endpoint: '/oauth/revoke',
        }),
      )
      .mockResolvedValueOnce(json({ client_id: 'cid-1' }))
    const { url } = await service.register('u1', { baseUrl: `${BASE}/some/path`, tunnelDeclared: false })
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe(`${BASE}/oauth/authorize`)
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256')
    expect(parsed.searchParams.get('code_challenge')).toBeTruthy()
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://api.bellum.test/beeper/callback')
    expect(parsed.searchParams.get('client_id')).toBe('cid-1')
    // Le vérificateur ne voyage pas dans l'URL.
    expect(url).not.toContain('code_verifier')
    expect(getRow()).toMatchObject({ status: 'pending', base_url: BASE, client_id: 'cid-1', access_token_enc: null })
    const registerBody = JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))
    expect(registerBody).toMatchObject({
      token_endpoint_auth_method: 'none',
      redirect_uris: ['https://api.bellum.test/beeper/callback'],
    })
  })

  it('retour OAuth : état falsifié refusé ; état valide → jeton CHIFFRÉ, envoyé avec le code_verifier', async () => {
    const { service, fetchMock, getRow } = build()
    fetchMock
      .mockResolvedValueOnce(
        json({
          authorization_endpoint: '/oauth/authorize',
          token_endpoint: '/oauth/token',
          registration_endpoint: '/oauth/register',
        }),
      )
      .mockResolvedValueOnce(json({ client_id: 'cid-1' }))
      .mockResolvedValueOnce(json({ access_token: SECRET_TOKEN, refresh_token: 'refresh-SECRET', expires_in: 3600 }))
    const { url } = await service.register('u1', { baseUrl: BASE, tunnelDeclared: false })
    const state = new URL(url).searchParams.get('state')!
    expect(await service.handleCallback('code', `${state}x`)).toEqual({ ok: false, reason: 'invalid_state' })
    expect(await service.handleCallback('code', state)).toEqual({ ok: true })
    const form = new URLSearchParams(String(fetchMock.mock.calls[2]![1]!.body))
    expect(form.get('code_verifier')).toBeTruthy()
    expect(form.get('grant_type')).toBe('authorization_code')
    const row = getRow()!
    expect(row.status).toBe('connected')
    expect(row.access_token_enc).not.toContain(SECRET_TOKEN)
    expect(decryptToken(row.access_token_enc!)).toBe(SECRET_TOKEN)
  })

  it('le jeton n’est JAMAIS renvoyé au client ni journalisé', async () => {
    const { encryptToken } = await import('../crm/crm-token.crypto')
    const { service, fetchMock } = build({ row: { access_token_enc: encryptToken(SECRET_TOKEN) } })
    const logs: string[] = []
    const spies = (['log', 'warn', 'error', 'debug'] as const).map(level =>
      jest.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(' '))
      }),
    )
    const loggerSpy = jest
      .spyOn((service as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn')
      .mockImplementation(m => {
        logs.push(String(m))
      })
    fetchMock.mockResolvedValueOnce(json({ items: [] }))
    const status = await service.getStatus('u1')
    fetchMock.mockResolvedValueOnce(json({ items: [{ id: 'c1', network: 'WhatsApp', participants: { items: [] } }] }))
    const list = await service.listConversations('u1')
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    const down = await service.listConversations('u1')
    expect(JSON.stringify([status, list, down])).not.toContain(SECRET_TOKEN)
    expect(logs.join('\n')).not.toContain(SECRET_TOKEN)
    spies.forEach(s => s.mockRestore())
    loggerSpy.mockRestore()
  })

  it('Desktop fermé / tunnel coupé → « unreachable » NOMMÉ (statut et liste), jamais une liste vide', async () => {
    const { encryptToken } = await import('../crm/crm-token.crypto')
    const { service, fetchMock } = build({ row: { access_token_enc: encryptToken(SECRET_TOKEN) } })
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    expect(await service.getStatus('u1')).toMatchObject({ state: 'unreachable' })
    const res = await service.listConversations('u1')
    expect(res.state).toBe('unreachable')
    expect(res).toHaveProperty('reason', expect.stringContaining('Beeper Desktop'))
    expect(await service.readOwnChat('u1', 'c1')).toMatchObject({ state: 'unreachable' })
  })

  it('déconnexion : révoque chez Beeper puis efface la ligne ; sans confirmation, efface quand même et le DIT', async () => {
    const { encryptToken } = await import('../crm/crm-token.crypto')
    const ok = build({
      row: { access_token_enc: encryptToken(SECRET_TOKEN), refresh_token_enc: encryptToken('refresh-SECRET') },
    })
    ok.fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))
    expect(await ok.service.disconnect('u1')).toEqual({ revoked: true, warning: null })
    expect(new URLSearchParams(String(ok.fetchMock.mock.calls[0]![1]!.body)).get('token')).toBe('refresh-SECRET')
    expect(ok.getRow()).toBeNull()

    const ko = build({ row: { access_token_enc: encryptToken(SECRET_TOKEN) } })
    ko.fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    const result = await ko.service.disconnect('u1')
    expect(result.revoked).toBe(false)
    expect(result.warning).toContain('Beeper')
    expect(ko.getRow()).toBeNull()
  })

  it('envoi : passe par la porte (origine user, idempotence, AUCUN texte dans la charge utile) puis Beeper', async () => {
    const { encryptToken } = await import('../crm/crm-token.crypto')
    const { service, fetchMock, outboundWrites } = build({ row: { access_token_enc: encryptToken(SECRET_TOKEN) } })
    fetchMock.mockResolvedValueOnce(json({ chatID: 'c1', pendingMessageID: 'p1' }))
    const key = '7f1c3b9e-2d4a-4e8b-9c1d-5a6b7c8d9e0f'
    expect(await service.sendReply('u1', 'c1', { text: 'Bonjour Nadia', idempotencyKey: key })).toEqual({
      status: 'sent',
      pendingMessageId: 'p1',
    })
    expect(outboundWrites.request).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'beeper',
        kind: 'send_chat_message',
        origin: 'user',
        idempotencyKey: `beeper:${key}`,
      }),
    )
    expect(JSON.stringify((outboundWrites.request.mock.calls[0] as unknown[])[0])).not.toContain('Bonjour Nadia')
    expect(outboundWrites.recordOutcome).toHaveBeenCalledWith('req-1', { ok: true, response: 'p1' })
  })

  it('envoi rejoué (même clé) : rien ne repart ; délai dépassé → `unknown`, jamais un échec', async () => {
    const { encryptToken } = await import('../crm/crm-token.crypto')
    const replay = build({ row: { access_token_enc: encryptToken(SECRET_TOKEN) } })
    replay.outboundWrites.request.mockResolvedValueOnce({ decision: 'already_done', request: { id: 'req-1' } })
    expect(
      await replay.service.sendReply('u1', 'c1', { text: 'x', idempotencyKey: '7f1c3b9e-2d4a-4e8b-9c1d-5a6b7c8d9e0f' }),
    ).toEqual({ status: 'already_done', pendingMessageId: null })
    expect(replay.fetchMock).not.toHaveBeenCalled()

    const timeout = build({ row: { access_token_enc: encryptToken(SECRET_TOKEN) } })
    timeout.fetchMock.mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'))
    await expect(
      timeout.service.sendReply('u1', 'c1', { text: 'x', idempotencyKey: '7f1c3b9e-2d4a-4e8b-9c1d-5a6b7c8d9e0f' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(timeout.outboundWrites.recordUnknown).toHaveBeenCalledWith('req-1', null)
  })

  it('démo : conversations fictives, rattachement calculé, aucun appel réseau, aucun envoi', async () => {
    const { service, fetchMock } = build({ demo: true })
    const res = await service.listConversations('u1')
    expect(res.state).toBe('connected')
    expect(res.state === 'connected' && res.conversations.length).toBeGreaterThanOrEqual(3)
    const chatId = res.state === 'connected' ? res.conversations[0]!.chatId : ''
    expect(await service.readOwnChat('u1', chatId)).toMatchObject({ state: 'connected' })
    await expect(
      service.sendReply('u1', chatId, { text: 'x', idempotencyKey: '7f1c3b9e-2d4a-4e8b-9c1d-5a6b7c8d9e0f' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

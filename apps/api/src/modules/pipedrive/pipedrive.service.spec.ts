import { Logger } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import type { UserActionEntity } from '../../database/entities/user-action.entity'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { encryptToken } from '../crm/crm-token.crypto'
import { readPipedriveConfig } from './pipedrive-config'
import { PipedriveService } from './pipedrive.service'

const USER = '11111111-1111-1111-1111-111111111111'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'

function makeRepo() {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<Repository<CrmConnectionEntity>>
}

function makeWorkspace() {
  return {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }),
  } as unknown as jest.Mocked<WorkspaceContextService>
}

function makeUserActions() {
  return { insert: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<Repository<UserActionEntity>>
}

const CONFIGURED_ENV = {
  PIPEDRIVE_CLIENT_ID: 'cid',
  PIPEDRIVE_CLIENT_SECRET: 'csecret',
  PIPEDRIVE_REDIRECT_URI: 'https://api.example.com/pipedrive/callback',
  INTERNAL_API_SECRET: 'internal-secret-with-entropy-123456',
}

describe('readPipedriveConfig', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
  })

  it('is null (no-op) unless the three required vars are set', () => {
    delete process.env['PIPEDRIVE_CLIENT_ID']
    delete process.env['PIPEDRIVE_CLIENT_SECRET']
    delete process.env['PIPEDRIVE_REDIRECT_URI']
    expect(readPipedriveConfig()).toBeNull()
    Object.assign(process.env, CONFIGURED_ENV)
    const cfg = readPipedriveConfig()
    expect(cfg).not.toBeNull()
    expect(cfg?.clientId).toBe('cid')
    expect(cfg?.redirectUri).toBe(CONFIGURED_ENV.PIPEDRIVE_REDIRECT_URI)
    expect(cfg?.scopes).toBe('') // defers to the app's registered scopes by default
  })
})

describe('PipedriveService', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  it('getStatus is a pure no-op when unconfigured (never touches DB or workspace)', async () => {
    delete process.env['PIPEDRIVE_CLIENT_ID']
    const repo = makeRepo()
    const ws = makeWorkspace()
    const svc = new PipedriveService(repo, makeUserActions(), ws)

    const status = await svc.getStatus(USER)
    expect(status).toEqual({ configured: false, connected: false })
    expect(ws.resolveActiveWorkspace).not.toHaveBeenCalled()
    expect(repo.findOne).not.toHaveBeenCalled()
  })

  it('reports connected with the company label when a connection exists', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      account_label: 'acme.pipedrive.com',
      created_at: new Date('2026-07-10'),
    })
    const svc = new PipedriveService(repo, makeUserActions(), makeWorkspace())
    const status = await svc.getStatus(USER)
    expect(status).toMatchObject({
      configured: true,
      connected: true,
      provider: 'pipedrive',
      accountLabel: 'acme.pipedrive.com',
    })
  })

  it('builds a Pipedrive authorize URL with a signed state', () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const svc = new PipedriveService(makeRepo(), makeUserActions(), makeWorkspace())
    const url = new URL(svc.buildAuthorizeUrl(USER))
    expect(url.origin + url.pathname).toBe('https://oauth.pipedrive.com/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('redirect_uri')).toBe(CONFIGURED_ENV.PIPEDRIVE_REDIRECT_URI)
    // No scope param when PIPEDRIVE_SCOPES is unset (defers to app registration).
    expect(url.searchParams.get('scope')).toBeNull()
    const state = url.searchParams.get('state') ?? ''
    expect(state.split('.')).toHaveLength(2) // payload.signature
  })

  it('forwards an explicit scope list when PIPEDRIVE_SCOPES is set', () => {
    Object.assign(process.env, CONFIGURED_ENV, { PIPEDRIVE_SCOPES: 'contacts:full search:read' })
    const svc = new PipedriveService(makeRepo(), makeUserActions(), makeWorkspace())
    const url = new URL(svc.buildAuthorizeUrl(USER))
    expect(url.searchParams.get('scope')).toBe('contacts:full search:read')
  })

  it('callback with a tampered state fails gracefully (no throw to browser)', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const svc = new PipedriveService(makeRepo(), makeUserActions(), makeWorkspace())
    await expect(svc.handleCallback('code', 'not-a-valid-state')).resolves.toEqual({
      ok: false,
      reason: 'invalid_state',
    })
  })

  it('disconnect is a no-op (no delete) when the workspace has no connection', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = makeRepo() // findOne → null
    const svc = new PipedriveService(repo, makeUserActions(), makeWorkspace())
    await expect(svc.disconnect(USER)).resolves.toEqual({ revoked: true, warning: null })
    expect(repo.delete).not.toHaveBeenCalled()
  })
})

/**
 * Déconnexion — révocation server-side (le défaut : « does not revoke
 * server-side at Pipedrive »). Même modèle que Google/HubSpot (POST
 * {OAUTH_BASE}/oauth/revoke, best-effort) + ce qu'eux ne faisaient pas
 * encore : dire à l'appelant si la révocation a RÉELLEMENT eu lieu.
 */
describe('PipedriveService — disconnect (revocation)', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  /** A repo already holding a connected Pipedrive row with a refresh token. */
  function connectedRepo() {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      id: 'conn-1',
      provider: 'pipedrive',
      instance_url: 'https://acme.pipedrive.com',
      access_token_enc: encryptToken('AT'),
      refresh_token_enc: encryptToken('the-refresh-token'),
      expires_at: new Date(Date.now() + 3_600_000),
    })
    return repo
  }

  function stubFetch(handler: () => { status?: number; body?: unknown }): jest.Mock {
    return jest.spyOn(global, 'fetch' as never).mockImplementation((async () => {
      const { status = 200, body = {} } = handler()
      return { ok: status >= 200 && status < 300, status, json: async () => body }
    }) as never) as unknown as jest.Mock
  }

  it('RÉVOQUE le jeton chez Pipedrive avant d’effacer la ligne', async () => {
    const repo = connectedRepo()
    const fetchSpy = stubFetch(() => ({ body: {} }))
    const svc = new PipedriveService(repo, makeUserActions(), makeWorkspace())

    await expect(svc.disconnect(USER)).resolves.toEqual({ revoked: true, warning: null })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('https://oauth.pipedrive.com/oauth/revoke')
    expect(repo.delete).toHaveBeenCalledWith({ id: 'conn-1' })
  })

  it('efface quand même si Pipedrive REFUSE la révocation, et prévient l’utilisateur', async () => {
    const repo = connectedRepo()
    stubFetch(() => ({ status: 401, body: { error: 'invalid_client' } }))
    const svc = new PipedriveService(repo, makeUserActions(), makeWorkspace())

    const result = await svc.disconnect(USER)

    expect(repo.delete).toHaveBeenCalledWith({ id: 'conn-1' })
    expect(result.revoked).toBe(false)
    expect(result.warning).toMatch(/n.a pas confirmé la révocation/)
  })

  it('efface quand même si Pipedrive est INJOIGNABLE (panne réseau), et prévient l’utilisateur', async () => {
    const repo = connectedRepo()
    jest.spyOn(global, 'fetch' as never).mockRejectedValue(
      Object.assign(new Error('fetch failed'), {
        cause: { code: 'ECONNREFUSED' },
      }) as never,
    )
    const svc = new PipedriveService(repo, makeUserActions(), makeWorkspace())

    const result = await svc.disconnect(USER)

    expect(repo.delete).toHaveBeenCalledWith({ id: 'conn-1' })
    expect(result.revoked).toBe(false)
    expect(result.warning).toMatch(/n.a pas confirmé la révocation/)
  })

  it('un geste utilisateur ne dépend jamais du fournisseur : timeout classé `unknown`, pas rejoué', async () => {
    const repo = connectedRepo()
    jest.spyOn(global, 'fetch' as never).mockRejectedValue(
      Object.assign(new Error('UND_ERR_HEADERS_TIMEOUT'), {
        code: 'UND_ERR_HEADERS_TIMEOUT',
      }) as never,
    )
    const logged = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const svc = new PipedriveService(repo, makeUserActions(), makeWorkspace())

    const result = await svc.disconnect(USER)

    expect(repo.delete).toHaveBeenCalledWith({ id: 'conn-1' })
    expect(result.revoked).toBe(false)
    const [, meta] = logged.mock.calls[0] as [string, { tags: Record<string, string> }]
    expect(meta.tags['revocation.outcome']).toBe('unknown')
  })

  it('n’écrit JAMAIS le jeton dans ce qui est journalisé', async () => {
    const repo = connectedRepo()
    stubFetch(() => ({ status: 401, body: { error: 'invalid_client' } }))
    const logged = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const svc = new PipedriveService(repo, makeUserActions(), makeWorkspace())

    await svc.disconnect(USER)

    expect(logged).toHaveBeenCalled()
    expect(JSON.stringify(logged.mock.calls)).not.toContain('the-refresh-token')
  })
})

/**
 * Two-way write-back for Pipedrive: export upserts a Person by email (item
 * search → PATCH update, else create) so re-exporting no longer duplicates.
 */
describe('PipedriveService — upsert export', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  /** A repo already holding a connected Pipedrive row with a fresh token + api_domain. */
  function connectedSvc() {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      id: 'conn-1',
      provider: 'pipedrive',
      instance_url: 'https://acme.pipedrive.com',
      access_token_enc: encryptToken('AT'),
      refresh_token_enc: encryptToken('RT'),
      expires_at: new Date(Date.now() + 3_600_000),
    })
    return new PipedriveService(repo, makeUserActions(), makeWorkspace())
  }

  type Init = { method?: string; body?: string }
  function stubFetch(handler: (url: string, method: string) => { status?: number; body?: unknown }): jest.Mock {
    return jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL, init?: Init) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const { status = 200, body = {} } = handler(url, method)
      return { ok: status >= 200 && status < 300, status, json: async () => body }
    }) as never) as unknown as jest.Mock
  }

  it('UPDATES an existing Person matched by email instead of creating a duplicate', async () => {
    const svc = connectedSvc()
    const fetchSpy = stubFetch((url, method) => {
      if (url.includes('/persons/search')) return { body: { data: { items: [{ item: { id: 42 } }] } } }
      if (method === 'PATCH' && url.includes('/persons/42')) return { body: { data: { id: 42 } } }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await svc.exportContact(USER, { email: 'jo@acme.com', firstName: 'Jo' })
    expect(result).toEqual({ id: '42', created: false })

    // No create: no POST to the persons collection endpoint.
    const created = fetchSpy.mock.calls.some(
      ([u, i]) => String(u).endsWith('/persons') && (i as Init | undefined)?.method === 'POST',
    )
    expect(created).toBe(false)
  })

  it('CREATES a new Person when no email match exists, mapping name/email/phone', async () => {
    const svc = connectedSvc()
    let createBody: Record<string, unknown> | undefined
    jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL, init?: Init) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.includes('/persons/search')) return { ok: true, status: 200, json: async () => ({ data: { items: [] } }) }
      if (method === 'POST' && url.endsWith('/persons')) {
        createBody = JSON.parse(init?.body ?? '{}')
        return { ok: true, status: 201, json: async () => ({ data: { id: 77 } }) }
      }
      throw new Error(`unexpected ${method} ${url}`)
    }) as never)

    const result = await svc.exportContact(USER, {
      email: 'new@acme.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '+33123456789',
    })
    expect(result).toEqual({ id: '77', created: true })
    expect(createBody).toMatchObject({
      name: 'Ada Lovelace',
      emails: [{ value: 'new@acme.com', primary: true, label: 'work' }],
      phones: [{ value: '+33123456789', primary: true, label: 'work' }],
    })
  })

  it('links a found Organization by name (org_id) when a company is supplied', async () => {
    const svc = connectedSvc()
    let createBody: Record<string, unknown> | undefined
    jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL, init?: Init) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.includes('/organizations/search'))
        return { ok: true, status: 200, json: async () => ({ data: { items: [{ item: { id: 9 } }] } }) }
      if (url.includes('/persons/search')) return { ok: true, status: 200, json: async () => ({ data: { items: [] } }) }
      if (method === 'POST' && url.endsWith('/persons')) {
        createBody = JSON.parse(init?.body ?? '{}')
        return { ok: true, status: 201, json: async () => ({ data: { id: 5 } }) }
      }
      throw new Error(`unexpected ${method} ${url}`)
    }) as never)

    const result = await svc.exportContact(USER, { email: 'ceo@acme.com', firstName: 'Rey', company: 'Acme' })
    expect(result).toEqual({ id: '5', created: true })
    expect(createBody).toMatchObject({ org_id: 9 })
  })
})

describe('PipedriveService — OAuth callback failure levels', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  function setup() {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
    const svc = new PipedriveService(makeRepo(), makeUserActions(), makeWorkspace())
    const state = new URL(svc.buildAuthorizeUrl(USER)).searchParams.get('state') as string
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation()
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation()
    return { svc, state, warn, error }
  }

  it('provider refusing the code is a warn (already shown as exchange_failed), never an error, never the code', async () => {
    const { svc, state, warn, error } = setup()
    jest.spyOn(global, 'fetch' as never).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    } as never)

    await expect(svc.handleCallback('secret-code-123', state)).resolves.toEqual({
      ok: false,
      reason: 'exchange_failed',
    })
    expect(error).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls)).toContain('invalid_grant')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-code-123')
  })

  it('our own failure (workspace resolution) stays an error', async () => {
    const { state, error } = setup()
    const workspace = makeWorkspace()
    workspace.resolveActiveWorkspace.mockRejectedValue(new Error('db down'))
    const svc = new PipedriveService(makeRepo(), makeUserActions(), workspace)
    await expect(svc.handleCallback('code', state)).resolves.toEqual({ ok: false, reason: 'exchange_failed' })
    expect(error).toHaveBeenCalledTimes(1)
  })
})

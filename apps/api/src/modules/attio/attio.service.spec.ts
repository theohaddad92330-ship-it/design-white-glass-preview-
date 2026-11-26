import { Logger } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import type { UserActionEntity } from '../../database/entities/user-action.entity'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { encryptToken } from '../crm/crm-token.crypto'
import { readAttioConfig } from './attio-config'
import { AttioService } from './attio.service'

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
  ATTIO_CLIENT_ID: 'cid',
  ATTIO_CLIENT_SECRET: 'csecret',
  ATTIO_REDIRECT_URI: 'https://api.example.com/attio/callback',
  INTERNAL_API_SECRET: 'internal-secret-with-entropy-123456',
}

describe('readAttioConfig', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
  })

  it('is null (no-op) unless the three required vars are set', () => {
    delete process.env['ATTIO_CLIENT_ID']
    expect(readAttioConfig()).toBeNull()
    Object.assign(process.env, CONFIGURED_ENV)
    const cfg = readAttioConfig()
    expect(cfg).not.toBeNull()
    expect(cfg?.redirectUri).toBe(CONFIGURED_ENV.ATTIO_REDIRECT_URI)
    expect(cfg?.scopes).toContain('record_permission') // informational default
  })
})

describe('AttioService', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  it('getStatus is a pure no-op when unconfigured (never touches DB or workspace)', async () => {
    delete process.env['ATTIO_CLIENT_ID']
    const repo = makeRepo()
    const ws = makeWorkspace()
    const svc = new AttioService(repo, makeUserActions(), ws)

    const status = await svc.getStatus(USER)
    expect(status).toEqual({ configured: false, connected: false })
    expect(ws.resolveActiveWorkspace).not.toHaveBeenCalled()
    expect(repo.findOne).not.toHaveBeenCalled()
  })

  it('reports connected with the workspace label when a connection exists', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      account_label: 'Acme Workspace',
      created_at: new Date('2026-07-10'),
    })
    const svc = new AttioService(repo, makeUserActions(), makeWorkspace())
    const status = await svc.getStatus(USER)
    expect(status).toMatchObject({
      configured: true,
      connected: true,
      provider: 'attio',
      accountLabel: 'Acme Workspace',
    })
  })

  it('builds an Attio authorize URL with a signed state and no scope param', () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const svc = new AttioService(makeRepo(), makeUserActions(), makeWorkspace())
    const url = new URL(svc.buildAuthorizeUrl(USER))
    expect(url.origin + url.pathname).toBe('https://app.attio.com/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('redirect_uri')).toBe(CONFIGURED_ENV.ATTIO_REDIRECT_URI)
    expect(url.searchParams.has('scope')).toBe(false) // Attio grants scopes app-side
    const state = url.searchParams.get('state') ?? ''
    expect(state.split('.')).toHaveLength(2) // payload.signature
  })

  it('callback with a tampered state fails gracefully (no throw to browser)', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const svc = new AttioService(makeRepo(), makeUserActions(), makeWorkspace())
    await expect(svc.handleCallback('code', 'not-a-valid-state')).resolves.toEqual({
      ok: false,
      reason: 'invalid_state',
    })
  })
})

/**
 * Déconnexion — le défaut d'origine (« does not revoke server-side at Attio »).
 * Salesforce et Pipedrive ont été corrigés (commit d97ba6b1) en ajoutant un
 * vrai `revoke()` sur leur endpoint OAuth documenté. Attio n'en a PAS : son
 * unique référence OAuth publique — authorize/token/introspect
 * (docs.attio.com/docs/oauth/*, listés en entier par docs.attio.com/llms.txt)
 * — et l'OpenAPI publié (api.attio.com/openapi/api, qui ne cite
 * app.attio.com/authorize et /oauth/token que comme URLs du security scheme
 * OAuth2, jamais comme opérations) ne contiennent ni `revoke` ni `DELETE` sur
 * un token. Vérifié le 30/08/2026. Donc pas de AttioClient.revoke() — un appel
 * sur un endpoint deviné échouerait en silence tout en faisant croire que
 * c'est fait. Le correctif ici est honnête plutôt que silencieux : la ligne
 * locale est TOUJOURS effacée, et l'utilisateur est TOUJOURS prévenu qu'il
 * doit aussi couper l'accès depuis son compte Attio — jamais un 204 muet qui
 * laisserait croire que Bellum a coupé l'accès.
 */
describe('AttioService — disconnect (revocation)', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  it('ne supprime rien et ne prévient de rien quand l’espace n’a pas de connexion', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = makeRepo() // findOne → null
    const svc = new AttioService(repo, makeUserActions(), makeWorkspace())

    await expect(svc.disconnect(USER)).resolves.toEqual({ revoked: true, warning: null })
    expect(repo.delete).not.toHaveBeenCalled()
  })

  it('efface la ligne locale et prévient TOUJOURS l’utilisateur — Attio ne documente aucun endpoint de révocation', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      id: 'conn-1',
      provider: 'attio',
      access_token_enc: encryptToken('AT'),
      refresh_token_enc: null,
      expires_at: null,
    })
    const svc = new AttioService(repo, makeUserActions(), makeWorkspace())

    const result = await svc.disconnect(USER)

    expect(repo.delete).toHaveBeenCalledWith({ id: 'conn-1' })
    expect(result.revoked).toBe(false)
    expect(result.warning).toMatch(/n.a pas confirmé la révocation/)
  })

  it('ne fait AUCUN appel réseau — aucun endpoint de révocation Attio n’est établi', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      id: 'conn-1',
      provider: 'attio',
      access_token_enc: encryptToken('AT'),
      refresh_token_enc: null,
      expires_at: null,
    })
    const fetchSpy = jest.spyOn(global, 'fetch' as never)
    const svc = new AttioService(repo, makeUserActions(), makeWorkspace())

    await svc.disconnect(USER)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('n’écrit JAMAIS le jeton dans ce qui est journalisé', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
    const repo = makeRepo()
    const secretToken = encryptToken('super-secret-attio-access-token')
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      id: 'conn-1',
      provider: 'attio',
      access_token_enc: secretToken,
      refresh_token_enc: null,
      expires_at: null,
    })
    const logged = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const svc = new AttioService(repo, makeUserActions(), makeWorkspace())

    await svc.disconnect(USER)

    expect(logged).toHaveBeenCalled()
    expect(JSON.stringify(logged.mock.calls)).not.toContain('super-secret-attio-access-token')
    expect(JSON.stringify(logged.mock.calls)).not.toContain(secretToken)
  })
})

type Init = { method?: string; body?: string }
function stubFetch(handler: (url: string, method: string) => { status?: number; body?: unknown }): jest.Mock {
  return jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL, init?: Init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const { status = 200, body = {} } = handler(url, method)
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  }) as never) as unknown as jest.Mock
}

/**
 * OAuth callback: valid signed state → token exchange + identify → an encrypted
 * connection row is persisted (refresh token + expiry stay null: Attio tokens
 * are long-lived).
 */
describe('AttioService — OAuth callback', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  it('exchanges the code and persists an encrypted connection with a valid state', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
    const repo = makeRepo()
    const svc = new AttioService(repo, makeUserActions(), makeWorkspace())
    // Reuse the service's own signer to get a genuinely valid state.
    const state = new URL(svc.buildAuthorizeUrl(USER)).searchParams.get('state') as string

    stubFetch((url, method) => {
      if (url.endsWith('/oauth/token') && method === 'POST')
        return { body: { access_token: 'AT', token_type: 'Bearer' } }
      if (url.endsWith('/v2/self')) return { body: { workspace_id: 'ws-1', workspace_name: 'Acme Workspace' } }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await expect(svc.handleCallback('the-code', state)).resolves.toEqual({ ok: true })
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'attio',
        account_label: 'Acme Workspace',
        external_account_id: 'ws-1',
        refresh_token_enc: null,
        expires_at: null,
      }),
    )
  })
})

/**
 * Two-way write-back for Attio: export upserts a Person by email (query → PUT
 * upsert when it exists, else POST create) so re-exporting no longer duplicates.
 */
describe('AttioService — upsert export', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  /** A repo already holding a connected Attio row with a stored access token. */
  function connectedSvc() {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      id: 'conn-1',
      provider: 'attio',
      access_token_enc: encryptToken('AT'),
      refresh_token_enc: null,
      expires_at: null,
    })
    const userActions = makeUserActions()
    const svc = new AttioService(repo, userActions, makeWorkspace())
    return { svc, userActions }
  }

  it('UPDATES an existing Person matched by email instead of creating a duplicate', async () => {
    const { svc } = connectedSvc()
    const fetchSpy = stubFetch((url, method) => {
      if (url.endsWith('/records/query') && method === 'POST')
        return { body: { data: [{ id: { record_id: 'attio-existing' } }] } }
      if (method === 'PUT') return { body: { data: { id: { record_id: 'attio-existing' } } } }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await svc.exportContact(USER, { email: 'jo@acme.com', firstName: 'Jo' })
    expect(result).toEqual({ id: 'attio-existing', created: false })

    // No create: no POST to the bare records collection endpoint.
    const created = fetchSpy.mock.calls.some(
      ([u, i]) => String(u).endsWith('/people/records') && (i as Init | undefined)?.method === 'POST',
    )
    expect(created).toBe(false)
  })

  it('CREATES a new Person when no email match exists', async () => {
    const { svc } = connectedSvc()
    stubFetch((url, method) => {
      if (url.endsWith('/records/query') && method === 'POST') return { body: { data: [] } }
      if (method === 'POST' && url.endsWith('/people/records'))
        return { status: 201, body: { data: { id: { record_id: 'attio-new' } } } }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await svc.exportContact(USER, { email: 'new@acme.com', firstName: 'Ada', lastName: 'Lovelace' })
    expect(result).toEqual({ id: 'attio-new', created: true })
  })

  it('journals an `export` user action after a successful export', async () => {
    const { svc, userActions } = connectedSvc()
    stubFetch((url, method) => {
      if (url.endsWith('/records/query') && method === 'POST') return { body: { data: [] } }
      if (method === 'POST' && url.endsWith('/people/records'))
        return { status: 201, body: { data: { id: { record_id: 'attio-new' } } } }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await svc.exportContact(USER, { email: 'new@acme.com', firstName: 'Ada' })

    expect(userActions.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER,
        workspace_id: WORKSPACE,
        action_type: 'export',
        metadata: expect.objectContaining({ provider: 'attio' }),
      }),
    )
  })

  it('never fails a successful export because the audit write failed', async () => {
    const { svc, userActions } = connectedSvc()
    ;(userActions.insert as jest.Mock).mockRejectedValueOnce(new Error('db down'))
    stubFetch((url, method) => {
      if (url.endsWith('/records/query') && method === 'POST') return { body: { data: [] } }
      if (method === 'POST' && url.endsWith('/people/records'))
        return { status: 201, body: { data: { id: { record_id: 'attio-new' } } } }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await expect(svc.exportContact(USER, { email: 'new@acme.com', firstName: 'Ada' })).resolves.toEqual({
      id: 'attio-new',
      created: true,
    })
  })
})

/**
 * A besoin lands as a **Note on the account's Company** when it carries a
 * company, and falls back to a standalone **Task** when it has none (a note
 * needs a parent, and we never invent a company).
 */
describe('AttioService — besoin export (exportNeed)', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  function connectedSvc() {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      id: 'conn-1',
      provider: 'attio',
      access_token_enc: encryptToken('AT'),
      refresh_token_enc: null,
      expires_at: null,
    })
    return new AttioService(repo, makeUserActions(), makeWorkspace())
  }

  it('crée une Note sur la Company quand le besoin porte un compte', async () => {
    const svc = connectedSvc()
    stubFetch((url, method) => {
      if (url.endsWith('/companies/records/query') && method === 'POST')
        return { body: { data: [{ id: { record_id: 'co-1' } }] } }
      if (url.endsWith('/v2/notes') && method === 'POST') return { body: { data: { id: { note_id: 'note-9' } } } }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await expect(svc.exportNeed(USER, { subject: 'Besoin — TF1', body: 'x', company: 'TF1' })).resolves.toEqual({
      id: 'note-9',
      object: 'note',
    })
  })

  it('retombe sur une Task quand le besoin n’a pas de compte (jamais de Company inventée)', async () => {
    const svc = connectedSvc()
    const spy = stubFetch((url, method) => {
      if (url.endsWith('/v2/tasks') && method === 'POST') return { body: { data: { id: { task_id: 'task-9' } } } }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await expect(svc.exportNeed(USER, { subject: 'Besoin', body: 'x', company: null })).resolves.toEqual({
      id: 'task-9',
      object: 'task',
    })
    // Aucune résolution de Company n'a été tentée.
    expect(spy.mock.calls.some(([u]) => String(u).includes('/companies/records'))).toBe(false)
  })
})

describe('AttioService — OAuth callback failure levels', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  function setup() {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
    const svc = new AttioService(makeRepo(), makeUserActions(), makeWorkspace())
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
    const svc = new AttioService(makeRepo(), makeUserActions(), workspace)
    await expect(svc.handleCallback('code', state)).resolves.toEqual({ ok: false, reason: 'exchange_failed' })
    expect(error).toHaveBeenCalledTimes(1)
  })
})

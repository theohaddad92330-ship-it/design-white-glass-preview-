import type { Repository } from 'typeorm'
import type { MicrosoftConnectionEntity } from '../../database/entities/microsoft-connection.entity'
import type { SuppressionService } from '../mailer/suppression.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { encryptToken } from '../crm/crm-token.crypto'
import { MicrosoftService } from './microsoft.service'

const USER = '11111111-1111-1111-1111-111111111111'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'

function makeRepo() {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    insert: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<Repository<MicrosoftConnectionEntity>>
}

function makeWorkspace() {
  return {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }),
  } as unknown as jest.Mocked<WorkspaceContextService>
}

function makeSuppression(suppressed = false) {
  return {
    isSuppressed: jest.fn().mockResolvedValue(suppressed),
  } as unknown as jest.Mocked<SuppressionService>
}

const CONFIGURED_ENV = {
  MICROSOFT_CLIENT_ID: 'cid',
  MICROSOFT_CLIENT_SECRET: 'csecret',
  MICROSOFT_REDIRECT_URI: 'https://api.example.com/microsoft/callback',
  INTERNAL_API_SECRET: 'internal-secret-with-entropy-123456',
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

describe('MicrosoftService — OAuth + status', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  it('getStatus is a pure no-op when unconfigured (never touches DB, workspace or network)', async () => {
    delete process.env['MICROSOFT_CLIENT_ID']
    delete process.env['MICROSOFT_CLIENT_SECRET']
    delete process.env['MICROSOFT_REDIRECT_URI']
    const repo = makeRepo()
    const ws = makeWorkspace()
    const fetchSpy = stubFetch(() => ({ body: {} }))
    const svc = new MicrosoftService(repo, ws, makeSuppression())

    const status = await svc.getStatus(USER)
    expect(status).toEqual({ configured: false, connected: false })
    expect(ws.resolveActiveWorkspace).not.toHaveBeenCalled()
    expect(repo.findOne).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled() // ZERO network without keys
  })

  it('reports connected with the mailbox label when a connection exists', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      account_label: 'rep@contoso.com',
      created_at: new Date('2026-07-10'),
    })
    const svc = new MicrosoftService(repo, makeWorkspace(), makeSuppression())
    const status = await svc.getStatus(USER)
    expect(status).toMatchObject({
      configured: true,
      connected: true,
      provider: 'microsoft',
      accountLabel: 'rep@contoso.com',
    })
  })

  it('builds an Azure AD v2.0 authorize URL with a signed state', () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const svc = new MicrosoftService(makeRepo(), makeWorkspace(), makeSuppression())
    const url = new URL(svc.buildAuthorizeUrl(USER))
    expect(url.origin + url.pathname).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('redirect_uri')).toBe(CONFIGURED_ENV.MICROSOFT_REDIRECT_URI)
    expect(url.searchParams.get('scope')).toContain('Mail.Send')
    const state = url.searchParams.get('state') ?? ''
    expect(state.split('.')).toHaveLength(2) // payload.signature
  })

  it('callback with a tampered state fails gracefully (no throw to browser, no exchange)', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const fetchSpy = stubFetch(() => ({ body: {} }))
    const svc = new MicrosoftService(makeRepo(), makeWorkspace(), makeSuppression())
    await expect(svc.handleCallback('code', 'not-a-valid-state')).resolves.toEqual({
      ok: false,
      reason: 'invalid_state',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('déconnecte SA ligne, jamais celle d’un collègue', async () => {
    // Même défaut que côté Google : la suppression portait sur l'ESPACE et
    // emportait la connexion d'un autre membre.
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = makeRepo()
    ;(repo.find as jest.Mock).mockResolvedValue([{ id: 'conn-ms', provider: 'microsoft' }])
    const svc = new MicrosoftService(repo, makeWorkspace(), makeSuppression())
    await svc.disconnect(USER)
    expect(repo.delete).toHaveBeenCalledWith({ id: 'conn-ms' })
  })

  it('ne supprime rien quand ce membre n’a pas de connexion à lui', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue(null)
    await new MicrosoftService(repo, makeWorkspace(), makeSuppression()).disconnect(USER)
    expect(repo.delete).not.toHaveBeenCalled()
  })
})

describe('MicrosoftService — mail send (Graph /me/sendMail)', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  /** A repo already holding a connected Microsoft row with a fresh access token. */
  function connectedRepo() {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      id: 'conn-1',
      provider: 'microsoft',
      access_token_enc: encryptToken('AT'),
      refresh_token_enc: encryptToken('RT'),
      expires_at: new Date(Date.now() + 3_600_000),
    })
    return repo
  }

  it('sends a single email and returns the recipient (Graph 202)', async () => {
    const repo = connectedRepo()
    const suppression = makeSuppression(false)
    const svc = new MicrosoftService(repo, makeWorkspace(), suppression)
    const fetchSpy = stubFetch((url, method) => {
      if (method === 'POST' && url.endsWith('/me/sendMail')) return { status: 202 }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await svc.sendMail(USER, { to: 'lead@acme.com', subject: 'Hello', body: 'Bonjour' })
    expect(result).toEqual({ to: 'lead@acme.com' })
    expect(suppression.isSuppressed).toHaveBeenCalledWith(WORKSPACE, 'lead@acme.com')

    const sent = fetchSpy.mock.calls.some(
      ([u, i]) => String(u).endsWith('/me/sendMail') && (i as Init | undefined)?.method === 'POST',
    )
    expect(sent).toBe(true)
  })

  it('REFUSES to send to an opted-out recipient — no Graph call at all (#394)', async () => {
    const repo = connectedRepo()
    const svc = new MicrosoftService(repo, makeWorkspace(), makeSuppression(true))
    const fetchSpy = stubFetch(() => ({ body: {} }))

    await expect(svc.sendMail(USER, { to: 'optout@acme.com', subject: 'Hi', body: 'x' })).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(repo.findOne).not.toHaveBeenCalled() // refused before touching the token
  })
})

describe('MicrosoftService — calendar event (Graph /me/events)', () => {
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
      provider: 'microsoft',
      access_token_enc: encryptToken('AT'),
      refresh_token_enc: encryptToken('RT'),
      expires_at: new Date(Date.now() + 3_600_000),
    })
    return new MicrosoftService(repo, makeWorkspace(), makeSuppression())
  }

  it('creates an event and returns its id + webLink (Graph 201)', async () => {
    const svc = connectedSvc()
    const fetchSpy = stubFetch((url, method) => {
      if (method === 'POST' && url.endsWith('/me/events')) {
        return { status: 201, body: { id: 'evt-1', webLink: 'https://outlook.office.com/evt-1' } }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await svc.createCalendarEvent(USER, {
      subject: 'RDV découverte',
      start: '2026-07-20T14:00:00Z',
      end: '2026-07-20T14:30:00Z',
      attendees: [{ email: 'lead@acme.com', name: 'Lead' }],
    })
    expect(result).toEqual({ id: 'evt-1', webLink: 'https://outlook.office.com/evt-1' })

    const created = fetchSpy.mock.calls.some(
      ([u, i]) => String(u).endsWith('/me/events') && (i as Init | undefined)?.method === 'POST',
    )
    expect(created).toBe(true)
  })

  it('RETIRE un invité qui a demandé à ne plus être contacté', async () => {
    // T-169 : Graph notifie lui-même chaque invité, donc `attendees` est un
    // chemin d'envoi complet — et il ne consultait aucun verdict d'arrêt.
    // On retire l'invité plutôt que de refuser l'événement.
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      id: 'conn-1',
      provider: 'microsoft',
      access_token_enc: encryptToken('AT'),
      refresh_token_enc: encryptToken('RT'),
      expires_at: new Date(Date.now() + 3_600_000),
    })
    const suppression = makeSuppression()
    ;(suppression.isSuppressed as jest.Mock).mockImplementation(
      async (_ws: string, email: string) => email === 'parti@acme.com',
    )
    const svc = new MicrosoftService(repo, makeWorkspace(), suppression)

    const fetchSpy = stubFetch((url, method) => {
      if (method === 'POST' && url.endsWith('/me/events')) {
        return { status: 201, body: { id: 'evt-2', webLink: 'https://outlook.office.com/evt-2' } }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await svc.createCalendarEvent(USER, {
      subject: 'Point projet',
      start: '2026-07-20T14:00:00Z',
      end: '2026-07-20T14:30:00Z',
      attendees: [
        { email: 'lead@acme.com', name: 'Lead' },
        { email: 'parti@acme.com', name: 'Parti' },
      ],
    })

    const post = fetchSpy.mock.calls.find(
      ([u, i]) => String(u).endsWith('/me/events') && (i as Init | undefined)?.method === 'POST',
    )
    const payload = JSON.parse((post?.[1] as Init | undefined)?.body ?? '{}') as Record<string, unknown>
    const attendees = (payload['attendees'] ?? []) as unknown[]
    expect(attendees).toHaveLength(1)
    expect(JSON.stringify(attendees)).toContain('lead@acme.com')
    expect(JSON.stringify(attendees)).not.toContain('parti@acme.com')
  })
})

describe('MicrosoftService — #4546 plusieurs boîtes par commercial', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  it("listConnections rend toutes les connexions de l'utilisateur", async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = makeRepo()
    ;(repo.find as jest.Mock).mockResolvedValue([
      { id: 'ms-1', account_label: 'perso@outlook.com', created_at: new Date('2026-09-01'), scope: 'Mail.Send' },
      { id: 'ms-2', account_label: 'pro@contoso.com', created_at: new Date('2026-10-01'), scope: 'Mail.Send' },
    ])
    const svc = new MicrosoftService(repo, makeWorkspace(), makeSuppression())
    const list = await svc.listConnections(USER)
    expect(list).toHaveLength(2)
    expect(list.map(c => c.accountLabel)).toEqual(['perso@outlook.com', 'pro@contoso.com'])
    expect(repo.find).toHaveBeenCalledWith({
      where: { user_id: USER, provider: 'microsoft' },
      order: { created_at: 'DESC' },
    })
  })

  it('déconnecter avec ID cible UNE connexion, pas les autres', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({ id: 'ms-2', user_id: USER, provider: 'microsoft' })
    const svc = new MicrosoftService(repo, makeWorkspace(), makeSuppression())
    await svc.disconnect(USER, 'ms-2')
    expect(repo.delete).toHaveBeenCalledWith({ id: 'ms-2' })
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'ms-2', user_id: USER, provider: 'microsoft' } })
  })

  it("listConnections rend un tableau vide quand Microsoft n'est pas configuré", async () => {
    delete process.env['MICROSOFT_CLIENT_ID']
    delete process.env['MICROSOFT_CLIENT_SECRET']
    const repo = makeRepo()
    const svc = new MicrosoftService(repo, makeWorkspace(), makeSuppression())
    const list = await svc.listConnections(USER)
    expect(list).toEqual([])
    expect(repo.find).not.toHaveBeenCalled()
  })
})

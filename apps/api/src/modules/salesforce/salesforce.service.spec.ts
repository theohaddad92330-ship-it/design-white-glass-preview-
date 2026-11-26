import { Logger } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import type { UserActionEntity } from '../../database/entities/user-action.entity'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { encryptToken } from '../crm/crm-token.crypto'
import { readSalesforceConfig } from './salesforce-config'
import { SalesforceService } from './salesforce.service'

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
  SALESFORCE_CLIENT_ID: 'cid',
  SALESFORCE_CLIENT_SECRET: 'csecret',
  SALESFORCE_REDIRECT_URI: 'https://api.example.com/salesforce/callback',
  INTERNAL_API_SECRET: 'internal-secret-with-entropy-123456',
}

describe('readSalesforceConfig', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
  })

  it('is null (no-op) unless the three required vars are set', () => {
    delete process.env['SALESFORCE_CLIENT_ID']
    expect(readSalesforceConfig()).toBeNull()
    Object.assign(process.env, CONFIGURED_ENV)
    const cfg = readSalesforceConfig()
    expect(cfg).not.toBeNull()
    expect(cfg?.loginUrl).toBe('https://login.salesforce.com') // prod default
    expect(cfg?.scopes).toContain('refresh_token')
  })
})

describe('SalesforceService', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  it('getStatus is a pure no-op when unconfigured (never touches DB or workspace)', async () => {
    delete process.env['SALESFORCE_CLIENT_ID']
    const repo = makeRepo()
    const ws = makeWorkspace()
    const svc = new SalesforceService(repo, makeUserActions(), ws)

    const status = await svc.getStatus(USER)
    expect(status).toEqual({ configured: false, connected: false })
    expect(ws.resolveActiveWorkspace).not.toHaveBeenCalled()
    expect(repo.findOne).not.toHaveBeenCalled()
  })

  it('reports connected with the org label when a connection exists', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      account_label: 'acme.my.salesforce.com',
      created_at: new Date('2026-07-10'),
    })
    const svc = new SalesforceService(repo, makeUserActions(), makeWorkspace())
    const status = await svc.getStatus(USER)
    expect(status).toMatchObject({
      configured: true,
      connected: true,
      provider: 'salesforce',
      accountLabel: 'acme.my.salesforce.com',
    })
  })

  it('builds a Salesforce authorize URL with a signed state', () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const svc = new SalesforceService(makeRepo(), makeUserActions(), makeWorkspace())
    const url = new URL(svc.buildAuthorizeUrl(USER))
    expect(url.origin + url.pathname).toBe('https://login.salesforce.com/services/oauth2/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('redirect_uri')).toBe(CONFIGURED_ENV.SALESFORCE_REDIRECT_URI)
    const state = url.searchParams.get('state') ?? ''
    expect(state.split('.')).toHaveLength(2) // payload.signature
  })

  it('demande PKCE — Salesforce l’impose et ne laisse plus le décocher', () => {
    // La case « Demander l'extension Clé de preuve (PKCE) » est grisée sur les
    // applications connectées récentes. Sans `code_challenge`, l'échange du code
    // échoue avec un message qui accuse le secret : on cherche au mauvais endroit.
    Object.assign(process.env, CONFIGURED_ENV)
    const svc = new SalesforceService(makeRepo(), makeUserActions(), makeWorkspace())
    const url = new URL(svc.buildAuthorizeUrl(USER))

    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    const challenge = url.searchParams.get('code_challenge') ?? ''
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/) // base64url d'un SHA-256, sans padding
  })

  it('lie le défi PKCE à CETTE demande — deux consentements ne le partagent pas', () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const svc = new SalesforceService(makeRepo(), makeUserActions(), makeWorkspace())

    const first = new URL(svc.buildAuthorizeUrl(USER))
    const second = new URL(svc.buildAuthorizeUrl(USER))

    // Le défi dérive de l'état, qui porte un aléa : un défi réutilisable
    // annulerait ce que PKCE protège.
    expect(first.searchParams.get('code_challenge')).not.toBe(second.searchParams.get('code_challenge'))
  })

  it('callback with a tampered state fails gracefully (no throw to browser)', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const svc = new SalesforceService(makeRepo(), makeUserActions(), makeWorkspace())
    await expect(svc.handleCallback('code', 'not-a-valid-state')).resolves.toEqual({
      ok: false,
      reason: 'invalid_state',
    })
  })

  it('disconnect is a no-op (no delete) when the workspace has no connection', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = makeRepo() // findOne → null
    const svc = new SalesforceService(repo, makeUserActions(), makeWorkspace())
    await expect(svc.disconnect(USER)).resolves.toEqual({ revoked: true, warning: null })
    expect(repo.delete).not.toHaveBeenCalled()
  })
})

/**
 * Déconnexion — révocation server-side (le défaut : « does not revoke
 * server-side at Salesforce »). Même modèle que Google/HubSpot
 * (`{loginUrl}/services/oauth2/revoke`, best-effort) + ce qu'eux ne faisaient
 * pas encore : dire à l'appelant si la révocation a RÉELLEMENT eu lieu.
 */
describe('SalesforceService — disconnect (revocation)', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  /** A repo already holding a connected Salesforce row with a refresh token. */
  function connectedRepo() {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      id: 'conn-1',
      provider: 'salesforce',
      instance_url: 'https://acme.my.salesforce.com',
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

  it('RÉVOQUE le jeton chez Salesforce avant d’effacer la ligne', async () => {
    const repo = connectedRepo()
    const fetchSpy = stubFetch(() => ({ body: {} }))
    const svc = new SalesforceService(repo, makeUserActions(), makeWorkspace())

    await expect(svc.disconnect(USER)).resolves.toEqual({ revoked: true, warning: null })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('https://login.salesforce.com/services/oauth2/revoke')
    expect(repo.delete).toHaveBeenCalledWith({ id: 'conn-1' })
  })

  it('efface quand même si Salesforce REFUSE la révocation, et prévient l’utilisateur', async () => {
    const repo = connectedRepo()
    stubFetch(() => ({ status: 500, body: { message: 'org down' } }))
    const svc = new SalesforceService(repo, makeUserActions(), makeWorkspace())

    const result = await svc.disconnect(USER)

    expect(repo.delete).toHaveBeenCalledWith({ id: 'conn-1' })
    expect(result.revoked).toBe(false)
    expect(result.warning).toMatch(/n.a pas confirmé la révocation/)
  })

  it('efface quand même si Salesforce est INJOIGNABLE (panne réseau), et prévient l’utilisateur', async () => {
    const repo = connectedRepo()
    jest.spyOn(global, 'fetch' as never).mockRejectedValue(
      Object.assign(new Error('fetch failed'), {
        cause: { code: 'ECONNREFUSED' },
      }) as never,
    )
    const svc = new SalesforceService(repo, makeUserActions(), makeWorkspace())

    const result = await svc.disconnect(USER)

    expect(repo.delete).toHaveBeenCalledWith({ id: 'conn-1' })
    expect(result.revoked).toBe(false)
    expect(result.warning).toMatch(/n.a pas confirmé la révocation/)
  })

  it('un geste utilisateur ne dépend jamais du fournisseur : timeout classé `unknown`, pas rejoué', async () => {
    // La question posée par le dépôt (dispatchFailureOutcome) : la requête a-t-elle
    // pu PARTIR ? Un timeout headers/body EST parti — `unknown`, pas `failed`.
    const repo = connectedRepo()
    jest.spyOn(global, 'fetch' as never).mockRejectedValue(
      Object.assign(new Error('UND_ERR_HEADERS_TIMEOUT'), {
        code: 'UND_ERR_HEADERS_TIMEOUT',
      }) as never,
    )
    const logged = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const svc = new SalesforceService(repo, makeUserActions(), makeWorkspace())

    const result = await svc.disconnect(USER)

    expect(repo.delete).toHaveBeenCalledWith({ id: 'conn-1' })
    expect(result.revoked).toBe(false)
    const [, meta] = logged.mock.calls[0] as [string, { tags: Record<string, string> }]
    expect(meta.tags['revocation.outcome']).toBe('unknown')
  })

  it('n’écrit JAMAIS le jeton dans ce qui est journalisé', async () => {
    const repo = connectedRepo()
    stubFetch(() => ({ status: 500, body: { message: 'org down' } }))
    const logged = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const svc = new SalesforceService(repo, makeUserActions(), makeWorkspace())

    await svc.disconnect(USER)

    expect(logged).toHaveBeenCalled()
    expect(JSON.stringify(logged.mock.calls)).not.toContain('the-refresh-token')
  })
})

/**
 * Two-way write-back for Salesforce: export upserts a Contact by email (SOQL
 * lookup → PATCH update, else create) so re-exporting no longer duplicates.
 */
describe('SalesforceService — upsert export', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  /** A repo already holding a connected Salesforce row with a fresh token + instance. */
  function connectedSvc() {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      id: 'conn-1',
      provider: 'salesforce',
      instance_url: 'https://acme.my.salesforce.com',
      access_token_enc: encryptToken('AT'),
      refresh_token_enc: encryptToken('RT'),
      expires_at: new Date(Date.now() + 3_600_000),
    })
    const userActions = makeUserActions()
    const svc = new SalesforceService(repo, userActions, makeWorkspace())
    return { svc, userActions }
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

  it('UPDATES an existing Contact matched by email instead of creating a duplicate', async () => {
    const { svc } = connectedSvc()
    const fetchSpy = stubFetch((url, method) => {
      if (url.includes('/query?')) return { body: { records: [{ Id: 'sf-existing' }] } }
      if (method === 'PATCH') return { status: 204 } // Salesforce update returns no body
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await svc.exportContact(USER, { email: 'jo@acme.com', firstName: 'Jo' })
    expect(result).toEqual({ id: 'sf-existing', created: false })

    // No create: no POST to the Contact collection endpoint.
    const created = fetchSpy.mock.calls.some(
      ([u, i]) => String(u).endsWith('/sobjects/Contact') && (i as Init | undefined)?.method === 'POST',
    )
    expect(created).toBe(false)
  })

  it('CREATES a new Contact when no email match exists', async () => {
    const { svc } = connectedSvc()
    stubFetch((url, method) => {
      if (url.includes('/query?')) return { body: { records: [] } }
      if (method === 'POST' && url.endsWith('/sobjects/Contact')) return { status: 201, body: { id: 'sf-new' } }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await svc.exportContact(USER, { email: 'new@acme.com', firstName: 'Ada', lastName: 'Lovelace' })
    expect(result).toEqual({ id: 'sf-new', created: true })
  })

  it('K.1 — un 401 sur l’écriture d’une société rafraîchit le jeton puis réussit (une seule retentative)', async () => {
    const { svc } = connectedSvc()
    let accountQueries = 0
    const fetchSpy = stubFetch((url, method) => {
      if (url.includes('/services/oauth2/token'))
        return { body: { access_token: 'AT2', instance_url: 'https://acme.my.salesforce.com' } }
      if (url.includes('/query?')) {
        accountQueries += 1
        return accountQueries === 1
          ? { status: 401, body: [{ errorCode: 'INVALID_SESSION_ID' }] }
          : { body: { records: [{ Id: 'acc-1' }] } }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await svc.exportCompany(USER, { name: 'Acme' })
    expect(result).toEqual({ id: 'acc-1', created: false })
    expect(fetchSpy.mock.calls.filter(([u]) => String(u).includes('/oauth2/token'))).toHaveLength(1)
  })

  it('K.1 — refresh refusé : « reconnecte » (authorization_expired), pas une fiche refusée', async () => {
    const { svc } = connectedSvc()
    stubFetch(url => {
      if (url.includes('/services/oauth2/token')) return { status: 400, body: { error: 'invalid_grant' } }
      return { status: 401, body: [{ errorCode: 'INVALID_SESSION_ID' }] }
    })

    await expect(svc.exportCompany(USER, { name: 'Acme' })).rejects.toMatchObject({
      response: { code: 'authorization_expired' },
    })
  })

  it('K.1 — un deuxième 401 après rafraîchissement n’est pas retenté en boucle', async () => {
    const { svc } = connectedSvc()
    const fetchSpy = stubFetch(url => {
      if (url.includes('/services/oauth2/token')) return { body: { access_token: 'AT2' } }
      return { status: 401, body: [{}] }
    })
    await expect(svc.exportCompany(USER, { name: 'Acme' })).rejects.toThrow(/HTTP 401/)
    expect(fetchSpy.mock.calls.filter(([u]) => String(u).includes('/query?'))).toHaveLength(2)
  })

  it('journals an `export` user action after a successful export', async () => {
    const { svc, userActions } = connectedSvc()
    stubFetch((url, method) => {
      if (url.includes('/query?')) return { body: { records: [] } }
      if (method === 'POST' && url.endsWith('/sobjects/Contact')) return { status: 201, body: { id: 'sf-new' } }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await svc.exportContact(USER, { email: 'new@acme.com', firstName: 'Ada' })

    expect(userActions.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER, workspace_id: WORKSPACE, action_type: 'export' }),
    )
  })

  it('never fails a successful export because the audit write failed', async () => {
    const { svc, userActions } = connectedSvc()
    ;(userActions.insert as jest.Mock).mockRejectedValueOnce(new Error('db down'))
    stubFetch((url, method) => {
      if (url.includes('/query?')) return { body: { records: [] } }
      if (method === 'POST' && url.endsWith('/sobjects/Contact')) return { status: 201, body: { id: 'sf-new' } }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await expect(svc.exportContact(USER, { email: 'new@acme.com', firstName: 'Ada' })).resolves.toEqual({
      id: 'sf-new',
      created: true,
    })
  })
})

/**
 * Presence read-back (roadmap §8/§9) : SOQL over the org's Contact + open
 * Opportunity via the REAL query endpoint ({instance_url}/services/data/vXX.X/
 * query?q=…). No connection → strict no-op; errors degrade to empty; nothing is
 * ever invented.
 */
describe('SalesforceService — presence read-back', () => {
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
      provider: 'salesforce',
      instance_url: 'https://acme.my.salesforce.com',
      access_token_enc: encryptToken('AT'),
      refresh_token_enc: encryptToken('RT'),
      expires_at: new Date(Date.now() + 3_600_000),
    })
    return new SalesforceService(repo, makeUserActions(), makeWorkspace())
  }

  function stubFetch(handler: (url: string) => { status?: number; body?: unknown }): jest.Mock {
    return jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL) => {
      const { status = 200, body = {} } = handler(String(input))
      return { ok: status >= 200 && status < 300, status, json: async () => body }
    }) as never) as unknown as jest.Mock
  }

  it('is a strict no-op when Salesforce is not configured (provider null, zero network)', async () => {
    delete process.env['SALESFORCE_CLIENT_ID']
    const fetchSpy = jest.spyOn(global, 'fetch' as never)
    const svc = new SalesforceService(makeRepo(), makeUserActions(), makeWorkspace())
    const presence = await svc.findPresence(USER, { account: 'SNCF' })
    expect(presence.provider).toBeNull()
    expect(presence.matched).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('is a strict no-op when configured but the workspace has no connection', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const fetchSpy = jest.spyOn(global, 'fetch' as never)
    const svc = new SalesforceService(makeRepo(), makeUserActions(), makeWorkspace()) // findOne → null
    const presence = await svc.findPresence(USER, { account: 'SNCF' })
    expect(presence.provider).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns contacts + open opportunities from SOQL, scoped to the org instance', async () => {
    const svc = connectedSvc()
    const fetchSpy = stubFetch(url => {
      expect(url).toContain('https://acme.my.salesforce.com/services/data/') // per-org REST base
      const soql = decodeURIComponent(url.split('?q=')[1] ?? '')
      if (soql.startsWith('SELECT Id, Name, Email, Title, LastActivityDate FROM Contact')) {
        expect(soql).toContain("Account.Name LIKE '%SNCF%'")
        expect(soql).toContain("Email LIKE '%@sncf.fr'")
        return {
          body: {
            records: [
              { Id: 'c-1', Name: 'Alice Martin', Email: 'alice@sncf.fr', Title: 'DSI', LastActivityDate: '2026-06-01' },
              { Id: 'c-2', Name: 'Bob Durand', Email: null, Title: null, LastActivityDate: null },
            ],
          },
        }
      }
      if (soql.includes('FROM Opportunity')) {
        expect(soql).toContain('IsClosed = false')
        return {
          body: {
            records: [
              { Id: 'o-1', Name: 'TMA SNCF', StageName: 'Negotiation', Amount: 80000, LastActivityDate: '2026-06-12' },
            ],
          },
        }
      }
      throw new Error(`unexpected SOQL: ${soql}`)
    })

    const presence = await svc.findPresence(USER, { account: 'SNCF', domain: 'sncf.fr' })

    expect(presence.provider).toBe('salesforce')
    expect(presence.matched).toBe(true)
    expect(presence.contactsCount).toBe(2)
    expect(presence.contacts[0]).toEqual({ id: 'c-1', name: 'Alice Martin', email: 'alice@sncf.fr', jobTitle: 'DSI' })
    expect(presence.openDeals).toEqual([{ id: 'o-1', name: 'TMA SNCF', stage: 'Negotiation', amount: 80000 }])
    expect(presence.lastActivityAt).toBe(new Date('2026-06-12').toISOString())
    expect(fetchSpy).toHaveBeenCalledTimes(2) // one SOQL for contacts, one for opps
  })

  it('reports matched:false (still provider salesforce) when the org knows nothing', async () => {
    const svc = connectedSvc()
    stubFetch(() => ({ body: { records: [] } }))
    const presence = await svc.findPresence(USER, { account: 'Inconnue SARL' })
    expect(presence.provider).toBe('salesforce')
    expect(presence.matched).toBe(false)
    expect(presence.contacts).toEqual([])
    expect(presence.openDeals).toEqual([])
  })

  it('degrades to an EMPTY salesforce answer on an org outage (never throws, never invents)', async () => {
    const svc = connectedSvc()
    stubFetch(() => ({ status: 500, body: { message: 'org down' } }))
    const presence = await svc.findPresence(USER, { account: 'SNCF' })
    expect(presence).toEqual({
      provider: 'salesforce',
      matched: false,
      contactsCount: 0,
      contacts: [],
      openDeals: [],
      lastActivityAt: null,
    })
  })

  /**
   * #2854 — miroir du correctif HubSpot (`CrmService.findPresence`) : les
   * DEUX lectures (contacts, opportunités ouvertes) ont désormais leur propre
   * filet. Avant ce correctif, `Promise.all` faisait échouer les DEUX dès
   * qu'UNE seule remontait une erreur (permission Salesforce révoquée sur les
   * Contacts, par exemple) — des opportunités réellement ouvertes
   * disparaissaient de la réponse alors qu'elles n'avaient rien à voir avec
   * l'échec des contacts.
   */
  it('keeps the found open opportunities when the CONTACTS query fails', async () => {
    const svc = connectedSvc()
    stubFetch(url => {
      const soql = decodeURIComponent(url.split('?q=')[1] ?? '')
      if (soql.includes('FROM Contact')) return { status: 500, body: { message: 'permission revoked' } }
      return {
        body: {
          records: [
            { Id: 'o-1', Name: 'TMA', StageName: 'Negotiation', Amount: 80000, LastActivityDate: '2026-06-12' },
            { Id: 'o-2', Name: 'Refonte SI', StageName: 'Prospecting', Amount: null, LastActivityDate: '2026-06-10' },
          ],
        },
      }
    })
    const presence = await svc.findPresence(USER, { account: 'LVMH' })
    expect(presence.provider).toBe('salesforce')
    expect(presence.matched).toBe(true)
    expect(presence.contactsCount).toBe(0)
    expect(presence.contacts).toEqual([])
    expect(presence.openDeals).toHaveLength(2)
    expect(presence.openDeals.map(d => d.id)).toEqual(['o-1', 'o-2'])
  })

  it('neutralises SOQL wildcards/quotes in the account name (injection-safe LIKE)', async () => {
    const svc = connectedSvc()
    const fetchSpy = stubFetch(() => ({ body: { records: [] } }))
    await svc.findPresence(USER, { account: "O'Brien %100_" })
    const soql = decodeURIComponent(String(fetchSpy.mock.calls[0]?.[0]).split('?q=')[1] ?? '')
    expect(soql).toContain("O\\'Brien \\%100\\_")
  })
})

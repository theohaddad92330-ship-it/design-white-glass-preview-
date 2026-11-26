import { HttpException } from '@nestjs/common'
import type { OutboundWriteService } from './outbound-write.service'
import { CrmService } from './crm.service'
import type { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import type { UserActionEntity } from '../../database/entities/user-action.entity'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { Repository } from 'typeorm'
import { encryptToken } from './crm-token.crypto'

function makeUserActions() {
  return { insert: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<Repository<UserActionEntity>>
}

/** Minimal in-memory stand-in for the TypeORM repository. */
function makeRepo(initial: Partial<CrmConnectionEntity> | null = null) {
  const store: { row: Partial<CrmConnectionEntity> | null } = { row: initial }
  return {
    findOne: jest.fn(async () => store.row),
    insert: jest.fn(async (row: Partial<CrmConnectionEntity>) => {
      store.row = row
    }),
    update: jest.fn(async (_where: unknown, patch: Partial<CrmConnectionEntity>) => {
      store.row = { ...store.row, ...patch }
    }),
    delete: jest.fn(async () => {
      store.row = null
    }),
    manager: { query: jest.fn(async () => undefined) },
    _store: store,
  } as unknown as Repository<CrmConnectionEntity> & { _store: typeof store }
}

/**
 * La porte d'écriture CRM (BEL-INT-603) : dans les tests elle approuve, comme
 * elle le fait pour un geste d'utilisateur. Les tests qui vérifient la RÉTENTION
 * la construisent autrement.
 */
function makeOutbound() {
  return {
    request: jest.fn(async () => ({ decision: 'write_now' as const, request: { id: 'owr-1' } })),
    recordOutcome: jest.fn(async () => undefined),
  } as unknown as OutboundWriteService
}

const USER = '11111111-1111-1111-1111-111111111111'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'

/** Stub WorkspaceContextService that always resolves the given workspace —
 *  mirrors today's 1 user = 1 workspace reality. */
function makeWorkspaceContext(workspaceId = WORKSPACE, isDemo = false) {
  return {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId, role: 'owner' as const })),
    isDemoWorkspace: jest.fn(async () => isDemo),
  } as unknown as WorkspaceContextService & { resolveActiveWorkspace: jest.Mock }
}

describe('CrmService', () => {
  const OLD_ENV = { ...process.env }

  beforeEach(() => {
    process.env['HUBSPOT_CLIENT_ID'] = 'cid'
    process.env['HUBSPOT_CLIENT_SECRET'] = 'csecret'
    process.env['HUBSPOT_REDIRECT_URI'] = 'https://api.test/crm/hubspot/callback'
    process.env['INTERNAL_API_SECRET'] = 'internal-secret-for-state'
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
  })
  afterEach(() => {
    process.env = { ...OLD_ENV }
    jest.restoreAllMocks()
  })

  it('reports configured + not connected when no row exists', async () => {
    const svc = new CrmService(makeRepo(null), makeUserActions(), makeWorkspaceContext(), makeOutbound())
    const status = await svc.getStatus(USER)
    expect(status).toEqual({ configured: true, connected: false })
  })

  it('reports not configured when HubSpot env is absent', async () => {
    delete process.env['HUBSPOT_CLIENT_ID']
    const svc = new CrmService(makeRepo(null), makeUserActions(), makeWorkspaceContext(), makeOutbound())
    const status = await svc.getStatus(USER)
    expect(status.configured).toBe(false)
    expect(status.connected).toBe(false)
  })

  it('reports connected with the account label when a row exists', async () => {
    const svc = new CrmService(
      makeRepo({
        user_id: USER,
        workspace_id: WORKSPACE,
        provider: 'hubspot',
        account_label: 'acme.hubspot.com',
        created_at: new Date('2026-07-01'),
      }),
      makeUserActions(),
      makeWorkspaceContext(),
      makeOutbound(),
    )
    const status = await svc.getStatus(USER)
    expect(status.connected).toBe(true)
    expect(status.accountLabel).toBe('acme.hubspot.com')
    expect(status.provider).toBe('hubspot')
  })

  // Lot D01 (06/10/2026, #3719) — le connecteur CRM FICTIF de la salle de démonstration.
  describe('salle de démonstration — connecteur CRM fictif, aucune écriture externe', () => {
    it('propose un connecteur marqué `demo`, sans le déclarer connecté ni lire la base', async () => {
      const repo = makeRepo(null)
      const svc = new CrmService(repo, makeUserActions(), makeWorkspaceContext(WORKSPACE, true), makeOutbound())
      const status = await svc.getStatus(USER)
      expect(status).toEqual({
        configured: false,
        connected: false,
        demo: true,
        accountLabel: 'Bellum Conseil — CRM fictif',
      })
      expect(repo.findOne).not.toHaveBeenCalled()
    })

    it('hors démonstration, jamais de drapeau `demo`', async () => {
      const svc = new CrmService(makeRepo(null), makeUserActions(), makeWorkspaceContext(), makeOutbound())
      expect(await svc.getStatus(USER)).not.toHaveProperty('demo')
    })

    it('l’export rend un identifiant dérivé de l’adresse — zéro réseau, zéro porte, zéro jeton', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch' as never)
      const outbound = makeOutbound()
      const repo = makeRepo(null)
      const svc = new CrmService(repo, makeUserActions(), makeWorkspaceContext(WORKSPACE, true), outbound)
      const first = await svc.exportContact(USER, { email: 'nadia.perrin@sncf-groupe.example' })
      const again = await svc.exportContact(USER, { email: 'nadia.perrin@sncf-groupe.example' })
      expect(first?.id).toMatch(/^demo-[0-9a-f]{12}$/)
      expect(again?.id).toBe(first?.id)
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(repo.findOne).not.toHaveBeenCalled()
      expect(outbound.recordOutcome).not.toHaveBeenCalled()
    })
  })

  it('builds an authorize URL carrying client_id, redirect_uri and a signed state', () => {
    const svc = new CrmService(makeRepo(null), makeUserActions(), makeWorkspaceContext(), makeOutbound())
    const url = new URL(svc.buildAuthorizeUrl(USER))
    expect(url.origin + url.pathname).toBe('https://app.hubspot.com/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('redirect_uri')).toBe('https://api.test/crm/hubspot/callback')
    expect(url.searchParams.get('state')).toMatch(/^[\w-]+\.[\w-]+$/)
  })

  it('rejects a tampered state on callback (no token exchange attempted)', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as never)
    const svc = new CrmService(makeRepo(null), makeUserActions(), makeWorkspaceContext(), makeOutbound())
    const state = new URL(svc.buildAuthorizeUrl(USER)).searchParams.get('state')!
    const result = await svc.handleCallback('code', `${state}x`) // corrupt the signature
    expect(result).toEqual({ ok: false, reason: 'invalid_state' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('completes the callback for a valid state and persists an encrypted connection', async () => {
    const repo = makeRepo(null)
    const svc = new CrmService(repo, makeUserActions(), makeWorkspaceContext(), makeOutbound())
    const state = new URL(svc.buildAuthorizeUrl(USER)).searchParams.get('state')!

    jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL) => {
      const u = String(input)
      if (u.includes('/oauth/v1/token')) {
        // Des jetons factices LONGS et distinctifs : l'assertion « le chiffré ne
        // contient pas le clair » n'a de sens que si la chaîne cherchée a une
        // chance négligeable d'apparaître dans du base64 aléatoire. Avec « AT »,
        // deux caractères, elle sortait vraie une fois sur quelques dizaines —
        // le test échouait au hasard, sans qu'aucun code n'ait changé.
        return {
          ok: true,
          json: async () => ({
            access_token: 'access-token-en-clair-a-ne-jamais-persister',
            refresh_token: 'refresh-token-en-clair-a-ne-jamais-persister',
            expires_in: 1800,
          }),
        }
      }
      // token-info
      return { ok: true, json: async () => ({ hub_id: 42, hub_domain: 'acme.hubspot.com', scopes: ['oauth'] }) }
    }) as never)

    const result = await svc.handleCallback('valid-code', state)
    expect(result).toEqual({ ok: true })
    expect(repo.insert).toHaveBeenCalledTimes(1)
    // J.1 — la reconnexion remet à zéro les échecs de sonde d'avant les nouvelles portées, pour CET espace.
    expect(repo.manager.query).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE connector_capability_probes[\s\S]*last_error_code = NULL/),
      [WORKSPACE],
    )
    const row = repo._store.row!
    expect(row.user_id).toBe(USER)
    // Multi-user Phase 2: the connection is stamped with the caller's workspace
    // (created-by `user_id` kept) so team members share the one CRM link.
    expect(row.workspace_id).toBe(WORKSPACE)
    expect(row.account_label).toBe('acme.hubspot.com')
    // Tokens are stored encrypted, never in clear.
    expect(row.access_token_enc).toMatch(/^v1:/)
    expect(row.access_token_enc).not.toContain('access-token-en-clair-a-ne-jamais-persister')
    expect(row.refresh_token_enc).toMatch(/^v1:/)
    expect(row.refresh_token_enc).not.toContain('refresh-token-en-clair-a-ne-jamais-persister')
  })

  it('scopes the status read to the workspace, excluding another tenant’s connection', async () => {
    // A repo that actually honours the `where` clause: proves getStatus filters
    // by workspace_id (not user_id) — a connection in another workspace is
    // invisible even to a user who shares nothing but the provider.
    const rows: Partial<CrmConnectionEntity>[] = [
      { user_id: 'other-user', workspace_id: 'other-ws', provider: 'hubspot', account_label: 'foreign.hubspot.com' },
    ]
    const repo = {
      findOne: jest.fn(
        async (opts: { where: Record<string, unknown> }) =>
          rows.find(r => r.workspace_id === opts.where['workspace_id'] && r.provider === opts.where['provider']) ??
          null,
      ),
    } as unknown as Repository<CrmConnectionEntity>
    const svc = new CrmService(repo, makeUserActions(), makeWorkspaceContext(WORKSPACE), makeOutbound())

    const status = await svc.getStatus(USER)
    expect(status).toEqual({ configured: true, connected: false })
  })
})

/**
 * La trace des refus de rafraîchissement. C'est elle qui permet à l'écran
 * Intégrations de distinguer « jeton d'accès d'une heure » (normal, il se
 * renouvelle) de « connexion morte » (il faut se reconnecter) — sans elle, l'un
 * des deux mensonges est inévitable.
 */
describe('CrmService — trace des refus de rafraîchissement', () => {
  const OLD_ENV = { ...process.env }

  beforeEach(() => {
    process.env['HUBSPOT_CLIENT_ID'] = 'cid'
    process.env['HUBSPOT_CLIENT_SECRET'] = 'csecret'
    process.env['HUBSPOT_REDIRECT_URI'] = 'https://api.test/crm/hubspot/callback'
    process.env['INTERNAL_API_SECRET'] = 'internal-secret-for-state'
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
  })
  afterEach(() => {
    process.env = { ...OLD_ENV }
    jest.restoreAllMocks()
  })

  /** Une liaison dont le jeton d'ACCÈS est périmé — donc qui passe par le
   *  rafraîchissement au premier appel réel. */
  function staleSvc(extra: Partial<CrmConnectionEntity> = {}) {
    const repo = makeRepo({
      user_id: USER,
      workspace_id: WORKSPACE,
      provider: 'hubspot',
      access_token_enc: encryptToken('AT'),
      refresh_token_enc: encryptToken('RT'),
      expires_at: new Date(Date.now() - 3_600_000),
      created_at: new Date('2026-07-01'),
      ...extra,
    })
    const svc = new CrmService(repo, makeUserActions(), makeWorkspaceContext(), makeOutbound())
    return { svc, repo }
  }

  it('inscrit la date quand le fournisseur REFUSE le rafraîchissement', async () => {
    const { svc, repo } = staleSvc()
    jest.spyOn(global, 'fetch' as never).mockImplementation((async () => ({
      ok: false,
      status: 400,
      text: async () => 'invalid_grant',
    })) as never)

    // ⚠️ #1836 a changé ce que l'appelant REÇOIT, pas ce qui est écrit en base.
    // L'erreur brute (« HubSpot token refresh failed … ») remontait nue jusqu'au
    // filtre global, qui la rendait en 500 « erreur interne » — et elle nommait
    // l'éditeur. Elle sort maintenant traduite, avec le geste. La trace en base,
    // elle, est la même : c'est ce que ce test garde depuis toujours.
    await expect(svc.exportContact(USER, { email: 'jo@acme.com' })).rejects.toThrow(/reconnecte/i)
    expect(repo._store.row?.refresh_failed_at).toBeInstanceOf(Date)
  })

  /**
   * #1836 — LE 503 NU DE `/pilotage`, ET LE GESTE QU'IL CACHAIT.
   *
   * `GET /crm/pipeline/report` appelle `resolveAccess` à sa PREMIÈRE ligne,
   * hors du `try` qui protège la synchronisation : le refus levé ici sort donc
   * tel quel jusqu'au navigateur. Il sortait en
   * `ServiceUnavailableException('CRM token expired and cannot be refreshed')`
   * — une phrase de développeur, en anglais, sans `code`. L'écran ne lit que
   * `code` : il concluait « panne » et RETIRAIT le lien vers Intégrations, au
   * motif qu'une panne ne s'y répare pas. La connexion, elle, était bien là et
   * bien morte, et le geste existait.
   *
   * Ce que ces deux tests gardent : le code, la capacité, et une phrase qui dit
   * le geste sans nommer l'éditeur.
   */
  it('#1836 — jeton périmé sans rafraîchissement possible : « reconnecte », pas « panne »', async () => {
    const { svc } = staleSvc({ refresh_token_enc: null })

    const error = await svc.resolveAccess(USER).then(
      () => null,
      (thrown: unknown) => thrown,
    )

    expect(error).toBeInstanceOf(HttpException)
    const body = (error as HttpException).getResponse() as { code?: string; capability?: string; message?: string }
    expect((error as HttpException).getStatus()).toBe(503)
    expect(body.code).toBe('authorization_expired')
    expect(body.capability).toBe('crm')
    // La phrase du serveur est celle que l'écran affiche : elle dit le geste,
    // et elle ne nomme pas l'éditeur (règle produit du 02/08).
    expect(body.message).toContain('ton CRM')
    expect(body.message?.toLowerCase()).toContain('reconnecte')
    expect(body.message).not.toMatch(/hubspot/i)
  })

  it('#1836 — consentement RETIRÉ : le refus du fournisseur devient le même geste, pas un 500', async () => {
    // L'autre moitié du même défaut : quand le portail REFUSE le
    // rafraîchissement, l'erreur brute remontait nue — 500 « erreur interne »
    // sur un écran dont la réponse tenait en un clic. La trace en base était
    // pourtant déjà posée : le produit SAVAIT que la liaison était morte.
    const { svc, repo } = staleSvc()
    jest.spyOn(global, 'fetch' as never).mockImplementation((async () => ({
      ok: false,
      status: 400,
      text: async () => '{"status":"BAD_AUTH_REFRESH_TOKEN","message":"invalid_grant"}',
    })) as never)

    const error = await svc.resolveAccess(USER).then(
      () => null,
      (thrown: unknown) => thrown,
    )

    expect(error).toBeInstanceOf(HttpException)
    expect(((error as HttpException).getResponse() as { code?: string }).code).toBe('authorization_expired')
    expect(repo._store.row?.refresh_failed_at).toBeInstanceOf(Date)
  })

  it('#1836 — une panne PASSAGÈRE du fournisseur reste une panne : on ne condamne pas une liaison saine', async () => {
    // Le témoin du cas voisin. Le docblock de `refreshTrackingFailure` le dit
    // depuis toujours : « un refus passager (503 du fournisseur, réseau coupé)
    // ne doit pas condamner une connexion saine à afficher à reconnecter ».
    const { svc } = staleSvc()
    jest.spyOn(global, 'fetch' as never).mockImplementation((async () => {
      throw new Error('socket hang up')
    }) as never)

    const error = await svc.resolveAccess(USER).then(
      () => null,
      (thrown: unknown) => thrown,
    )

    expect(((error as HttpException).getResponse() as { code?: string }).code).toBe('provider_unavailable')
  })

  it('efface la trace au premier rafraîchissement réussi — un refus passager ne condamne pas une liaison saine', async () => {
    const { svc, repo } = staleSvc({ refresh_failed_at: new Date('2026-08-01T00:00:00.000Z') })
    jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/oauth/v1/token')) {
        return { ok: true, json: async () => ({ access_token: 'AT2', refresh_token: 'RT2', expires_in: 1800 }) }
      }
      if (url.endsWith('/contacts/search')) return { ok: true, json: async () => ({ results: [] }) }
      return { ok: true, json: async () => ({ id: 'new-1' }) }
    }) as never)

    await svc.exportContact(USER, { email: 'jo@acme.com' })
    expect(repo._store.row?.refresh_failed_at).toBeNull()
  })
})

/**
 * Two-way write-back: export upserts by email (no duplicate), plus import and
 * activity-log. Fetch is stubbed per HubSpot endpoint; the connection carries a
 * non-expiring encrypted access token so no token refresh call is made.
 */
describe('CrmService — two-way write-back', () => {
  const OLD_ENV = { ...process.env }

  beforeEach(() => {
    process.env['HUBSPOT_CLIENT_ID'] = 'cid'
    process.env['HUBSPOT_CLIENT_SECRET'] = 'csecret'
    process.env['HUBSPOT_REDIRECT_URI'] = 'https://api.test/crm/hubspot/callback'
    process.env['INTERNAL_API_SECRET'] = 'internal-secret-for-state'
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
  })
  afterEach(() => {
    process.env = { ...OLD_ENV }
    jest.restoreAllMocks()
  })

  /** A repo already holding a connected HubSpot row with a fresh access token. */
  function connectedSvc() {
    const repo = makeRepo({
      user_id: USER,
      workspace_id: WORKSPACE,
      provider: 'hubspot',
      account_label: 'acme.hubspot.com',
      access_token_enc: encryptToken('AT'),
      refresh_token_enc: encryptToken('RT'),
      expires_at: new Date(Date.now() + 3_600_000),
      created_at: new Date('2026-07-01'),
    })
    const userActions = makeUserActions()
    const svc = new CrmService(repo, userActions, makeWorkspaceContext(), makeOutbound())
    return { svc, userActions }
  }

  type Init = { method?: string; body?: string }
  function stubFetch(handler: (url: string, method: string) => unknown): jest.Mock {
    return jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL, init?: Init) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      return { ok: true, json: async () => handler(url, method) }
    }) as never) as unknown as jest.Mock
  }

  it('UPDATES an existing contact matched by email instead of creating a duplicate', async () => {
    const { svc } = connectedSvc()
    const fetchSpy = stubFetch((url, method) => {
      if (url.endsWith('/contacts/search')) return { results: [{ id: 'existing-1' }] }
      if (method === 'PATCH') return { id: 'existing-1' }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await svc.exportContact(USER, { email: 'jo@acme.com', firstName: 'Jo' })

    expect(result).toEqual({ id: 'existing-1', created: false })
    // No create: no POST to the bare contacts collection endpoint.
    const created = fetchSpy.mock.calls.some(
      ([u, i]) => String(u).endsWith('/objects/contacts') && (i as Init | undefined)?.method === 'POST',
    )
    expect(created).toBe(false)
  })

  it('CREATES a new contact when no email match exists', async () => {
    const { svc } = connectedSvc()
    stubFetch((url, method) => {
      if (url.endsWith('/contacts/search')) return { results: [] }
      if (method === 'POST' && url.endsWith('/objects/contacts')) return { id: 'new-9' }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await svc.exportContact(USER, { email: 'new@acme.com', firstName: 'Ada' })
    expect(result).toEqual({ id: 'new-9', created: true })
  })

  it('journals an `export` user action after a successful export', async () => {
    const { svc, userActions } = connectedSvc()
    stubFetch((url, method) => {
      if (url.endsWith('/contacts/search')) return { results: [] }
      if (method === 'POST' && url.endsWith('/objects/contacts')) return { id: 'new-9' }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await svc.exportContact(USER, { email: 'new@acme.com', firstName: 'Ada' })

    expect(userActions.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER, workspace_id: WORKSPACE, action_type: 'export' }),
    )
  })

  // #2319.114 (épopée #2985) — clôturer une tâche déjà créée, MÊME porte
  // d'écriture (`OutboundWriteService`) que les autres écritures CRM.
  it('closes a task through the outbound-write door (`close_task`)', async () => {
    const { svc } = connectedSvc()
    const outbound = (svc as unknown as { outbound: OutboundWriteService }).outbound
    const fetchSpy = stubFetch((url, method) => {
      if (method === 'PATCH' && url.endsWith('/objects/tasks/hs-42')) return { id: 'hs-42' }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await svc.closeTask(USER, { taskId: 'hs-42', subject: 'Relancer ACME' })

    expect(result).toEqual({ id: 'hs-42' })
    expect(outbound.request).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'close_task',
        payload: { externalId: 'hs-42', subject: 'Relancer ACME' },
        origin: 'user',
      }),
    )
    const patched = fetchSpy.mock.calls.find(
      ([u, i]) => String(u).endsWith('/objects/tasks/hs-42') && (i as Init | undefined)?.method === 'PATCH',
    )
    expect(patched).toBeDefined()
    const body = JSON.parse((patched?.[1] as Init | undefined)?.body ?? '{}')
    expect(body).toEqual({ properties: { hs_task_status: 'COMPLETED' } })
    expect(outbound.recordOutcome).toHaveBeenCalledWith('owr-1', { ok: true, response: 'hs-42' })
  })

  it('never writes when the door holds the request (system origin, pending)', async () => {
    const { svc } = connectedSvc()
    const outbound = (svc as unknown as { outbound: OutboundWriteService }).outbound
    ;(outbound.request as jest.Mock).mockResolvedValueOnce({ decision: 'pending', request: { id: 'owr-2' } })
    const fetchSpy = stubFetch(() => {
      throw new Error('no external call should happen while pending')
    })

    const result = await svc.closeTask(USER, { taskId: 'hs-42' }, { origin: 'system' })

    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('stamps the connection last_used_at after a successful export (Tool Registry v2 last_sync)', async () => {
    const repo = makeRepo({
      user_id: USER,
      workspace_id: WORKSPACE,
      provider: 'hubspot',
      access_token_enc: encryptToken('AT'),
      expires_at: new Date(Date.now() + 3_600_000),
      created_at: new Date('2026-07-01'),
    })
    const svc = new CrmService(repo, makeUserActions(), makeWorkspaceContext(), makeOutbound())
    stubFetch((url, method) => {
      if (url.endsWith('/contacts/search')) return { results: [] }
      if (method === 'POST' && url.endsWith('/objects/contacts')) return { id: 'new-9' }
      throw new Error(`unexpected ${method} ${url}`)
    })

    expect(repo._store.row?.last_used_at ?? null).toBeNull()
    await svc.exportContact(USER, { email: 'new@acme.com', firstName: 'Ada' })
    expect(repo._store.row?.last_used_at).toBeInstanceOf(Date)
  })

  it('never fails a successful export because the audit write failed', async () => {
    const { svc, userActions } = connectedSvc()
    ;(userActions.insert as jest.Mock).mockRejectedValueOnce(new Error('db down'))
    stubFetch((url, method) => {
      if (url.endsWith('/contacts/search')) return { results: [] }
      if (method === 'POST' && url.endsWith('/objects/contacts')) return { id: 'new-9' }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await expect(svc.exportContact(USER, { email: 'new@acme.com', firstName: 'Ada' })).resolves.toEqual({
      id: 'new-9',
      created: true,
    })
  })

  // #2855 — la porte transmet la PROVENANCE donnée par l'appelant, jamais
  // recalculée : `gate.source` voyage tel quel jusqu'à `outbound.request`.
  it('transmet la provenance donnée par l’appelant à la porte d’écriture', async () => {
    const outbound = makeOutbound()
    const repo = makeRepo({
      user_id: USER,
      workspace_id: WORKSPACE,
      provider: 'hubspot',
      access_token_enc: encryptToken('AT'),
      expires_at: new Date(Date.now() + 3_600_000),
      created_at: new Date('2026-07-01'),
    })
    const svc = new CrmService(repo, makeUserActions(), makeWorkspaceContext(), outbound)
    stubFetch((url, method) => {
      if (url.endsWith('/contacts/search')) return { results: [] }
      if (method === 'POST' && url.endsWith('/objects/contacts')) return { id: 'new-9' }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await svc.exportContact(
      USER,
      { email: 'new@acme.com', firstName: 'Ada' },
      { origin: 'system', source: { kind: 'mcp' } },
    )

    expect(outbound.request).toHaveBeenCalledWith(expect.objectContaining({ source: { kind: 'mcp' } }))
  })

  it('sans provenance donnée par l’appelant, la porte reçoit `null` — jamais devinée', async () => {
    const outbound = makeOutbound()
    const { svc } = (() => {
      const repo = makeRepo({
        user_id: USER,
        workspace_id: WORKSPACE,
        provider: 'hubspot',
        access_token_enc: encryptToken('AT'),
        expires_at: new Date(Date.now() + 3_600_000),
        created_at: new Date('2026-07-01'),
      })
      return { svc: new CrmService(repo, makeUserActions(), makeWorkspaceContext(), outbound) }
    })()
    stubFetch((url, method) => {
      if (url.endsWith('/contacts/search')) return { results: [] }
      if (method === 'POST' && url.endsWith('/objects/contacts')) return { id: 'new-9' }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await svc.exportContact(USER, { email: 'new@acme.com', firstName: 'Ada' })

    expect(outbound.request).toHaveBeenCalledWith(expect.objectContaining({ source: null }))
  })

  it('imports a page of contacts mapped to the small DTO, exposing the next cursor', async () => {
    const { svc } = connectedSvc()
    stubFetch(() => ({
      results: [
        {
          id: '501',
          properties: {
            email: 'lea@acme.com',
            firstname: 'Léa',
            lastname: 'Martin',
            company: 'Acme',
            jobtitle: 'CTO',
            phone: '+33100000000',
          },
        },
      ],
      paging: { next: { after: 'CURSOR-2' } },
    }))

    const page = await svc.listContacts(USER, { limit: 20 })
    expect(page.nextAfter).toBe('CURSOR-2')
    expect(page.contacts).toEqual([
      {
        id: '501',
        email: 'lea@acme.com',
        firstName: 'Léa',
        lastName: 'Martin',
        company: 'Acme',
        jobTitle: 'CTO',
        phone: '+33100000000',
      },
    ])
  })

  it('logs a Note engagement associated to the contact', async () => {
    const { svc } = connectedSvc()
    const fetchSpy = stubFetch((url, method) => {
      if (method === 'POST' && url.endsWith('/objects/notes')) return { id: 'note-1' }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const res = await svc.logActivity(USER, 'contact-77', 'email envoyé depuis Bellum')
    expect(res).toEqual({ id: 'note-1' })

    const noteCall = fetchSpy.mock.calls.find(([u]) => String(u).endsWith('/objects/notes'))!
    const sent = JSON.parse((noteCall[1] as Init).body!) as {
      properties: { hs_note_body: string }
      associations: Array<{ to: { id: string } }>
    }
    expect(sent.properties.hs_note_body).toBe('email envoyé depuis Bellum')
    expect(sent.associations[0]?.to.id).toBe('contact-77')
  })
})

/**
 * Presence read-back (roadmap §8/§9) : « as-tu déjà un contact chez ce groupe ? »
 * against the REAL HubSpot search endpoints (crm/v3/objects/{contacts,companies,
 * deals}/search). No connection → strict no-op (zero network); errors degrade to
 * an empty answer; nothing is ever invented.
 */
describe('CrmService — presence read-back', () => {
  const OLD_ENV = { ...process.env }

  beforeEach(() => {
    process.env['HUBSPOT_CLIENT_ID'] = 'cid'
    process.env['HUBSPOT_CLIENT_SECRET'] = 'csecret'
    process.env['HUBSPOT_REDIRECT_URI'] = 'https://api.test/crm/hubspot/callback'
    process.env['INTERNAL_API_SECRET'] = 'internal-secret-for-state'
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
  })
  afterEach(() => {
    process.env = { ...OLD_ENV }
    jest.restoreAllMocks()
  })

  function connectedSvc() {
    const repo = makeRepo({
      user_id: USER,
      workspace_id: WORKSPACE,
      provider: 'hubspot',
      access_token_enc: encryptToken('AT'),
      refresh_token_enc: encryptToken('RT'),
      expires_at: new Date(Date.now() + 3_600_000),
    })
    return new CrmService(repo, makeUserActions(), makeWorkspaceContext(), makeOutbound())
  }

  type Init = { method?: string; body?: string }
  function stubFetch(handler: (url: string, body: string) => { status?: number; body?: unknown }): jest.Mock {
    return jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL, init?: Init) => {
      const url = String(input)
      const { status = 200, body = {} } = handler(url, init?.body ?? '')
      return { ok: status >= 200 && status < 300, status, json: async () => body }
    }) as never) as unknown as jest.Mock
  }

  // #2556 — parité démo : le bloc « Ce que BellumAI ajoute à ce que tu sais »
  // lit la présence CRM. En salle de démonstration, le CRM FICTIF répond pour
  // les dossiers semés, sans réseau ; un compte hors salle reste inconnu.
  it('#2556 — salle de démonstration : le CRM fictif connaît les dossiers semés, sans réseau', async () => {
    delete process.env['HUBSPOT_CLIENT_ID']
    const fetchSpy = jest.spyOn(global, 'fetch' as never)
    const svc = new CrmService(makeRepo(null), makeUserActions(), makeWorkspaceContext(WORKSPACE, true), makeOutbound())
    const known = await svc.findPresence(USER, { account: 'SNCF' })
    expect(known.matched).toBe(true)
    expect(known.contacts.length).toBeGreaterThan(0)
    expect(known.contactsCount).toBe(known.contacts.length)
    expect(known.lastActivityAt).not.toBeNull()
    const unknown = await svc.findPresence(USER, { account: 'Inconnue SARL' })
    expect(unknown.matched).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('is a strict no-op when HubSpot is not configured (provider null, zero network)', async () => {
    delete process.env['HUBSPOT_CLIENT_ID']
    const fetchSpy = jest.spyOn(global, 'fetch' as never)
    const svc = new CrmService(makeRepo(null), makeUserActions(), makeWorkspaceContext(), makeOutbound())
    const presence = await svc.findPresence(USER, { account: 'SNCF' })
    expect(presence.provider).toBeNull()
    expect(presence.matched).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('is a strict no-op when configured but no workspace connection exists', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as never)
    const svc = new CrmService(makeRepo(null), makeUserActions(), makeWorkspaceContext(), makeOutbound())
    const presence = await svc.findPresence(USER, { account: 'SNCF' })
    expect(presence).toEqual({
      provider: null,
      matched: false,
      contactsCount: 0,
      contacts: [],
      openDeals: [],
      lastActivityAt: null,
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('scopes the connection lookup to the workspace (foreign tenant invisible → no-op)', async () => {
    const repo = {
      findOne: jest.fn(async (opts: { where: Record<string, unknown> }) =>
        opts.where['workspace_id'] === 'other-ws' ? { provider: 'hubspot' } : null,
      ),
    } as unknown as Repository<CrmConnectionEntity>
    const fetchSpy = jest.spyOn(global, 'fetch' as never)
    const svc = new CrmService(repo, makeUserActions(), makeWorkspaceContext(WORKSPACE), makeOutbound())
    const presence = await svc.findPresence(USER, { account: 'SNCF' })
    expect(presence.provider).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns contacts + open deals from the real search endpoints when the account matches', async () => {
    const svc = connectedSvc()
    const fetchSpy = stubFetch((url, body) => {
      if (url.endsWith('/objects/contacts/search')) {
        return {
          body: {
            total: 4,
            results: [
              {
                id: 'c-1',
                properties: {
                  email: 'alice@sncf.fr',
                  firstname: 'Alice',
                  lastname: 'Martin',
                  jobtitle: 'DSI',
                  lastmodifieddate: '2026-06-01T10:00:00Z',
                },
              },
            ],
          },
        }
      }
      if (url.endsWith('/objects/companies/search')) {
        return { body: { total: 1, results: [{ id: 'comp-9', properties: { name: 'SNCF', domain: 'sncf.fr' } }] } }
      }
      if (url.endsWith('/objects/deals/search')) {
        // The deals search must be keyed on the found company + open-only.
        expect(body).toContain('"associations.company"')
        expect(body).toContain('comp-9')
        expect(body).toContain('"hs_is_closed"')
        return {
          body: {
            total: 1,
            results: [
              {
                id: 'd-1',
                properties: {
                  dealname: 'Refonte SI',
                  dealstage: 'negotiation',
                  amount: '50000',
                  hs_lastmodifieddate: '2026-06-12T09:00:00Z',
                },
              },
            ],
          },
        }
      }
      throw new Error(`unexpected ${url}`)
    })

    const presence = await svc.findPresence(USER, { account: 'SNCF', domain: 'sncf.fr' })

    expect(presence.provider).toBe('hubspot')
    expect(presence.matched).toBe(true)
    expect(presence.contactsCount).toBe(4)
    expect(presence.contacts).toEqual([{ id: 'c-1', name: 'Alice Martin', email: 'alice@sncf.fr', jobTitle: 'DSI' }])
    // #1934.18 — `pipeline` est lu aussi ; absent de la réponse, il vaut `null` (inconnu), jamais deviné.
    expect(presence.openDeals).toEqual([
      { id: 'd-1', name: 'Refonte SI', stage: 'negotiation', pipeline: null, amount: 50000 },
    ])
    expect(presence.lastActivityAt).toBe('2026-06-12T09:00:00.000Z')

    // Contacts were matched by email domain and/or company name (OR filter groups).
    const contactCall = fetchSpy.mock.calls.find(([u]) => String(u).endsWith('/objects/contacts/search'))!
    const sent = (contactCall[1] as Init).body!
    expect(sent).toContain('*@sncf.fr')
    expect(sent).toContain('SNCF')
  })

  it('reports matched:false (still provider hubspot) when the portal knows nothing', async () => {
    const svc = connectedSvc()
    stubFetch(() => ({ body: { total: 0, results: [] } }))
    const presence = await svc.findPresence(USER, { account: 'Inconnue SARL' })
    expect(presence.provider).toBe('hubspot')
    expect(presence.matched).toBe(false)
    expect(presence.contacts).toEqual([])
    expect(presence.openDeals).toEqual([])
  })

  it('keeps the found contacts when the deals lookup fails (missing deals.read scope)', async () => {
    const svc = connectedSvc()
    stubFetch(url => {
      if (url.endsWith('/objects/contacts/search')) {
        return { body: { total: 2, results: [{ id: 'c-1', properties: { firstname: 'Léa' } }] } }
      }
      return { status: 403, body: { message: 'scope missing' } } // companies/deals refused
    })
    const presence = await svc.findPresence(USER, { account: 'SNCF' })
    expect(presence.matched).toBe(true)
    expect(presence.contactsCount).toBe(2)
    expect(presence.openDeals).toEqual([])
  })

  /**
   * #2854 — miroir du cas ci-dessus : recette 28/09 sur un compte à 2
   * opportunités actives (LVMH), « Faire avancer le lot » absent du DOM alors
   * que les affaires ÉTAIENT ouvertes côté HubSpot. Cause réelle : la lecture
   * des contacts n'avait pas son propre filet — un scope `contacts.read`
   * manquant (ou révoqué) faisait échouer `searchContactsAtCompany`, et cette
   * erreur remontait au `catch` GLOBAL de `findPresence`, qui renvoie
   * `emptyPresence()` sans même avoir tenté la lecture des affaires : des
   * affaires réellement ouvertes disparaissaient de la réponse, pas seulement
   * les contacts qui avaient échoué. Même raison que le test au-dessus
   * (« une lecture qui échoue n'efface pas celle qui a réussi »), symétrique.
   */
  it('keeps the found open deals when the CONTACTS lookup fails (missing contacts.read scope)', async () => {
    const svc = connectedSvc()
    stubFetch(url => {
      if (url.endsWith('/objects/contacts/search')) {
        return { status: 403, body: { message: 'scope missing' } }
      }
      if (url.endsWith('/objects/companies/search')) {
        return { body: { total: 1, results: [{ id: 'comp-lvmh', properties: { name: 'LVMH', domain: 'lvmh.com' } }] } }
      }
      if (url.endsWith('/objects/deals/search')) {
        return {
          body: {
            total: 2,
            results: [
              {
                id: 'd-1',
                properties: { dealname: 'TMA', dealstage: 'negotiation', hs_lastmodifieddate: '2026-09-20T09:00:00Z' },
              },
              {
                id: 'd-2',
                properties: {
                  dealname: 'Refonte SI',
                  dealstage: 'appointmentscheduled',
                  hs_lastmodifieddate: '2026-09-22T09:00:00Z',
                },
              },
            ],
          },
        }
      }
      throw new Error(`unexpected ${url}`)
    })
    const presence = await svc.findPresence(USER, { account: 'LVMH' })
    expect(presence.provider).toBe('hubspot')
    expect(presence.matched).toBe(true)
    expect(presence.contactsCount).toBe(0)
    expect(presence.contacts).toEqual([])
    expect(presence.openDeals).toHaveLength(2)
    expect(presence.openDeals.map(d => d.id)).toEqual(['d-1', 'd-2'])
  })

  it('degrades to an EMPTY hubspot answer on a full CRM outage (never throws, never invents)', async () => {
    const svc = connectedSvc()
    stubFetch(() => ({ status: 500, body: { message: 'hubspot down' } }))
    const presence = await svc.findPresence(USER, { account: 'SNCF' })
    expect(presence).toEqual({
      provider: 'hubspot',
      matched: false,
      contactsCount: 0,
      contacts: [],
      openDeals: [],
      lastActivityAt: null,
    })
  })

  describe('vocabulary (#2031.5 / #2045.5) — « PROPOSER sans remplir »', () => {
    it('is a strict no-op when HubSpot is not configured (provider null, zero network)', async () => {
      delete process.env['HUBSPOT_CLIENT_ID']
      const fetchSpy = jest.spyOn(global, 'fetch' as never)
      const svc = new CrmService(makeRepo(null), makeUserActions(), makeWorkspaceContext(), makeOutbound())
      const vocab = await svc.vocabulary(USER)
      expect(vocab).toEqual({ provider: null, industries: [], countries: [] })
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('is a strict no-op when configured but no workspace connection exists', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch' as never)
      const svc = new CrmService(makeRepo(null), makeUserActions(), makeWorkspaceContext(), makeOutbound())
      const vocab = await svc.vocabulary(USER)
      expect(vocab).toEqual({ provider: null, industries: [], countries: [] })
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('rend le vocabulaire BRUT du CRM — jamais mappé vers le catalogue ESN_ANSWER_OPTIONS', async () => {
      const svc = connectedSvc()
      stubFetch(url => {
        if (url.startsWith('https://api.hubapi.com/crm/v3/objects/companies?')) {
          return {
            body: {
              results: [
                { properties: { industry: 'COMPUTER_SOFTWARE', country: 'France' } },
                { properties: { industry: 'COMPUTER_SOFTWARE', country: 'Belgique' } },
                { properties: { industry: 'BANKING', country: '' } },
                { properties: {} },
              ],
              paging: {},
            },
          }
        }
        throw new Error(`unexpected ${url}`)
      })
      const vocab = await svc.vocabulary(USER)
      expect(vocab.provider).toBe('hubspot')
      // Distinctes, non vides — et les codes BRUTS HubSpot, jamais une valeur
      // d'`ESN_ANSWER_OPTIONS.target_sectors` (« Tech & Startups / Scale-ups »
      // n'apparaît nulle part : rien ici ne devine une correspondance).
      expect(vocab.industries).toEqual(['COMPUTER_SOFTWARE', 'BANKING'])
      expect(vocab.countries).toEqual(['France', 'Belgique'])
    })

    it('dégrade vers une réponse VIDE sur une panne CRM (jamais une erreur, jamais une valeur inventée)', async () => {
      const svc = connectedSvc()
      stubFetch(() => ({ status: 500, body: { message: 'hubspot down' } }))
      const vocab = await svc.vocabulary(USER)
      expect(vocab).toEqual({ provider: 'hubspot', industries: [], countries: [] })
    })
  })

  describe('networkSize (#2045.5, épopée #2859) — le total PORTAIL, jamais une bande', () => {
    it('is a strict no-op when HubSpot is not configured (provider null, total null, zero network)', async () => {
      delete process.env['HUBSPOT_CLIENT_ID']
      const fetchSpy = jest.spyOn(global, 'fetch' as never)
      const svc = new CrmService(makeRepo(null), makeUserActions(), makeWorkspaceContext(), makeOutbound())
      const size = await svc.networkSize(USER)
      expect(size).toEqual({ provider: null, total: null })
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('is a strict no-op when configured but no workspace connection exists', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch' as never)
      const svc = new CrmService(makeRepo(null), makeUserActions(), makeWorkspaceContext(), makeOutbound())
      const size = await svc.networkSize(USER)
      expect(size).toEqual({ provider: null, total: null })
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('rend le total RÉEL du portail — aucun filtre, jamais scopé à un compte', async () => {
      const svc = connectedSvc()
      const fetchSpy = stubFetch((url, body) => {
        if (url.endsWith('/objects/contacts/search')) {
          expect(JSON.parse(body)).toMatchObject({ filterGroups: [] })
          return { body: { total: 4213, results: [] } }
        }
        throw new Error(`unexpected ${url}`)
      })
      const size = await svc.networkSize(USER)
      expect(size).toEqual({ provider: 'hubspot', total: 4213 })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('un vrai portail VIDE rend 0 — un zéro MESURÉ, jamais une absence déguisée', async () => {
      const svc = connectedSvc()
      stubFetch(() => ({ body: { total: 0, results: [] } }))
      const size = await svc.networkSize(USER)
      expect(size).toEqual({ provider: 'hubspot', total: 0 })
    })

    it('dégrade vers `total: null` sur une panne CRM — jamais un zéro inventé (gardes GA-18/GA-19)', async () => {
      const svc = connectedSvc()
      stubFetch(() => ({ status: 500, body: { message: 'hubspot down' } }))
      const size = await svc.networkSize(USER)
      expect(size).toEqual({ provider: 'hubspot', total: null })
    })
  })

  describe('findContactRecord — la lecture entrante (§58, P1-07)', () => {
    it('sans e-mail, aucun appel réseau', async () => {
      const svc = new CrmService(makeRepo(null), makeUserActions(), makeWorkspaceContext(), makeOutbound())
      await expect(svc.findContactRecord(USER, null)).resolves.toBeNull()
      await expect(svc.findContactRecord(USER, '   ')).resolves.toBeNull()
    })

    it('sans CRM connecté, null et aucun appel réseau', async () => {
      const svc = new CrmService(makeRepo(null), makeUserActions(), makeWorkspaceContext(), makeOutbound())
      await expect(svc.findContactRecord(USER, 'a@b.fr')).resolves.toBeNull()
    })

    it('une lecture en échec rend null — « on ne sait pas », jamais « inconnu »', async () => {
      // Conclure l'absence d'une lecture ratée ferait réapparaître exactement le
      // doublon qu'on veut éviter : le produit reproposerait d'exporter une
      // fiche qui existe déjà côté CRM.
      const repo = makeRepo(null)
      repo.findOne = jest.fn().mockRejectedValue(new Error('pg down')) as never
      const svc = new CrmService(repo, makeUserActions(), makeWorkspaceContext(), makeOutbound())

      await expect(svc.findContactRecord(USER, 'a@b.fr')).resolves.toBeNull()
    })

    // #2261.13 (19/09) — `lastActivityAt` porte l'horodatage SOURCE
    // (`lastmodifieddate` HubSpot) que `CrmSyncService.syncOne` enregistre
    // comme une observation réelle pour la mesure de latence.
    it('porte `lastActivityAt` (#2261.13) — l’horodatage SOURCE que HubSpot rend, jamais deviné', async () => {
      const svc = connectedSvc()
      stubFetch(url => {
        if (url.endsWith('/contacts/search')) {
          return {
            body: {
              results: [{ id: '501', properties: { email: 'a@b.fr', lastmodifieddate: '2026-09-19T08:00:00Z' } }],
            },
          }
        }
        throw new Error(`unexpected ${url}`)
      })
      await expect(svc.findContactRecord(USER, 'a@b.fr')).resolves.toEqual({
        recordId: '501',
        provider: 'hubspot',
        email: 'a@b.fr',
        lastActivityAt: '2026-09-19T08:00:00.000Z',
      })
    })
  })

  describe('adoptCrmValue — Bellum fait foi, sauf geste explicite (arbitrage 03/08)', () => {
    it('sans dépôt de contacts, rien n’est écrit', async () => {
      // Le service est construit nu dans certaines specs : le geste doit
      // dégrader proprement plutôt que de lever.
      const svc = new CrmService(makeRepo(null), makeUserActions(), makeWorkspaceContext(), makeOutbound())
      await expect(svc.adoptCrmValue(USER, 'c-1', 'email')).resolves.toEqual({
        adopted: false,
        field: 'email',
        value: null,
      })
    })

    it('un contact qui n’appartient pas à l’appelant n’est pas modifié', async () => {
      // Un identifiant deviné ne doit pas pouvoir écrire sur la fiche de
      // quelqu'un d'autre : la relecture porte l'id ET le propriétaire.
      const contacts = { findOne: jest.fn().mockResolvedValue(null), update: jest.fn() }
      const svc = new CrmService(
        makeRepo(null),
        makeUserActions(),
        makeWorkspaceContext(),
        makeOutbound(),
        undefined,
        contacts as never,
      )

      const out = await svc.adoptCrmValue(USER, 'c-autre', 'email')

      expect(out.adopted).toBe(false)
      expect(contacts.update).not.toHaveBeenCalled()
    })

    it('sans valeur côté CRM, il n’y a rien à adopter', async () => {
      const contacts = {
        findOne: jest.fn().mockResolvedValue({ id: 'c-1', email: 'a@b.fr' }),
        update: jest.fn(),
      }
      const svc = new CrmService(
        makeRepo(null),
        makeUserActions(),
        makeWorkspaceContext(),
        makeOutbound(),
        undefined,
        contacts as never,
      )

      const out = await svc.adoptCrmValue(USER, 'c-1', 'phone')

      expect(out).toEqual({ adopted: false, field: 'phone', value: null })
      expect(contacts.update).not.toHaveBeenCalled()
    })
  })
})

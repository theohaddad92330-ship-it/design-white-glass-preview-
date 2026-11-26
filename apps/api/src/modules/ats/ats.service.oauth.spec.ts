import { Logger } from '@nestjs/common'
import { decryptToken, encryptToken } from '../crm/crm-token.crypto'
import { AtsCredentialsService } from './ats-credentials.service'
import { AtsService } from './ats.service'

const ENV_KEYS = [
  'BOONDMANAGER_OAUTH_CLIENT_ID',
  'BOONDMANAGER_OAUTH_CLIENT_SECRET',
  'BOONDMANAGER_OAUTH_REDIRECT_URI',
  'BOONDMANAGER_USER_TOKEN',
  'INTERNAL_API_SECRET',
]
const savedEnv: Record<string, string | undefined> = {}

type Row = Record<string, unknown> & { id: string; workspace_id: string }

function build(initial: Row | null = null, opts: { demo?: boolean } = {}) {
  let row: Row | null = initial
  const connections = {
    findOne: jest.fn(async () => row),
    create: jest.fn((x: Row) => x),
    save: jest.fn(async (x: Row) => {
      row = { ...(row ?? {}), ...x, id: row?.id ?? 'c1' } as Row
      return row
    }),
    update: jest.fn(async (_c: unknown, patch: Record<string, unknown>) => {
      if (row) row = { ...row, ...patch }
    }),
    delete: jest.fn(async () => {
      row = null
    }),
  }
  const svc = new AtsService(
    connections as never,
    {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w1' }),
      isDemoWorkspace: jest.fn().mockResolvedValue(Boolean(opts.demo)),
    } as never,
    new AtsCredentialsService(connections as never),
  )
  return {
    svc,
    connections,
    get row() {
      return row
    },
  }
}

const fetchMock = jest.fn()
const realFetch = global.fetch
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

/** Démarre un aller-retour et rend le state + le row posé. */
async function started(ctx: ReturnType<typeof build>) {
  const { url } = await ctx.svc.startOAuth('u1')
  const state = new URL(url).searchParams.get('state') as string
  return { url, state }
}

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
  process.env['BOONDMANAGER_OAUTH_CLIENT_ID'] = 'app-id'
  process.env['BOONDMANAGER_OAUTH_CLIENT_SECRET'] = 'app-secret'
  process.env['BOONDMANAGER_OAUTH_REDIRECT_URI'] = 'https://api.example.test/ats/oauth/callback'
  process.env['INTERNAL_API_SECRET'] = 'test-internal-secret'
  delete process.env['BOONDMANAGER_USER_TOKEN']
  fetchMock.mockReset()
  global.fetch = fetchMock as never
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  global.fetch = realFetch
  jest.restoreAllMocks()
})

describe('AtsService OAuth2 — démarrage', () => {
  it('rend l’URL d’autorisation (PKCE S256, state) et garde le verifier CÔTÉ SERVEUR, chiffré', async () => {
    const ctx = build()
    const { url, state } = await started(ctx)
    const u = new URL(url)
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('code_challenge')).toBeTruthy()
    expect(u.searchParams.get('code_verifier')).toBeNull()
    expect(url).not.toContain('app-secret')
    const row = ctx.row as Row
    expect(row.oauth_state_hash).toBeTruthy()
    expect(row.oauth_state_hash).not.toBe(state)
    expect(decryptToken(row.oauth_verifier_enc as string).length).toBeGreaterThanOrEqual(43)
    expect(row.access_token_enc ?? null).toBeNull()
  })

  it('REFUS : sans identifiants d’App → no-op strict, zéro appel réseau, zéro écriture', async () => {
    delete process.env['BOONDMANAGER_OAUTH_CLIENT_ID']
    const ctx = build()
    await expect(ctx.svc.startOAuth('u1')).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(ctx.connections.save).not.toHaveBeenCalled()
    expect((await ctx.svc.status('u1')).oauthAvailable).toBe(false)
    await ctx.svc.completeOAuth('code', 'state')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuse en espace de démonstration', async () => {
    const ctx = build(null, { demo: true })
    await expect(ctx.svc.startOAuth('u1')).rejects.toThrow(/démonstration/)
    expect(ctx.connections.save).not.toHaveBeenCalled()
  })
})

describe('AtsService OAuth2 — retour (callback)', () => {
  it('REFUS : state invalide → refus, AUCUNE écriture, aucun appel réseau', async () => {
    const ctx = build()
    await started(ctx)
    ctx.connections.save.mockClear()
    ctx.connections.update.mockClear()
    for (const bad of ['', 'n-importe-quoi', 'a.b', 'eyJ1IjoieCJ9.signature-bidon']) {
      expect(await ctx.svc.completeOAuth('code', bad)).toEqual({ ok: false, reason: 'invalid_state' })
    }
    expect(ctx.connections.save).not.toHaveBeenCalled()
    expect(ctx.connections.update).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('REFUS : un state bien signé mais jamais émis (empreinte inconnue) est refusé sans écriture', async () => {
    const a = build()
    const first = await started(a)
    const b = build()
    await started(b) // un autre aller-retour, un autre state
    b.connections.update.mockClear()
    expect(await b.svc.completeOAuth('code', first.state)).toEqual({ ok: false, reason: 'invalid_state' })
    expect(b.connections.update).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('REFUS : code_verifier absent côté serveur → refus AVANT tout appel réseau', async () => {
    const ctx = build()
    const { state } = await started(ctx)
    ;(ctx.row as Row).oauth_verifier_enc = null
    expect(await ctx.svc.completeOAuth('code', state)).toEqual({ ok: false, reason: 'missing_verifier' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('échange le code : jetons chiffrés, expires_at du expires_in rendu, scopes rendus, aller-retour purgé', async () => {
    const ctx = build()
    const { state } = await started(ctx)
    fetchMock.mockResolvedValue(
      json(200, { access_token: 'AT-1', refresh_token: 'RT-1', expires_in: 777, scope: 'x y' }),
    )
    const before = Date.now()
    expect(await ctx.svc.completeOAuth('the-code', state)).toEqual({ ok: true })
    const row = ctx.row as Row
    expect(row.auth_mode).toBe('oauth2')
    expect(decryptToken(row.access_token_enc as string)).toBe('AT-1')
    expect(decryptToken(row.refresh_token_enc as string)).toBe('RT-1')
    expect(row.access_token_enc).not.toContain('AT-1')
    const delta = (row.expires_at as Date).getTime() - before
    expect(delta).toBeGreaterThanOrEqual(777_000 - 50)
    expect(delta).toBeLessThan(777_000 + 5_000)
    expect(row.scopes).toBe('x y')
    expect(row.oauth_state_hash ?? null).toBeNull()
    expect(row.oauth_verifier_enc ?? null).toBeNull()
    expect(row.refresh_failed_at ?? null).toBeNull()
    // le state est à usage unique
    expect(await ctx.svc.completeOAuth('the-code', state)).toEqual({ ok: false, reason: 'invalid_state' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('un échange refusé par Boond ne branche rien et brûle quand même le state', async () => {
    const ctx = build()
    const { state } = await started(ctx)
    fetchMock.mockResolvedValue(json(400, { error: 'invalid_grant' }))
    expect(await ctx.svc.completeOAuth('bad', state)).toEqual({ ok: false, reason: 'exchange_failed' })
    expect((ctx.row as Row).access_token_enc ?? null).toBeNull()
    expect((await ctx.svc.status('u1')).connected).toBe(false)
    expect(await ctx.svc.completeOAuth('bad', state)).toEqual({ ok: false, reason: 'invalid_state' })
  })

  it('reconnecter une connexion héritée la migre : le secret collé est purgé', async () => {
    const ctx = build({
      id: 'c0',
      workspace_id: 'w1',
      created_by: 'u1',
      provider: 'boondmanager',
      auth_mode: 'user_token',
      credentials_enc: encryptToken('legacy-secret'),
      base_url: null,
      created_at: new Date(),
    })
    const { state } = await started(ctx)
    fetchMock.mockResolvedValue(json(200, { access_token: 'AT', refresh_token: 'RT', expires_in: 60 }))
    await ctx.svc.completeOAuth('c', state)
    expect((ctx.row as Row).auth_mode).toBe('oauth2')
    expect((ctx.row as Row).credentials_enc ?? null).toBeNull()
  })
})

function connectedRow(over: Partial<Row> = {}): Row {
  return {
    id: 'c1',
    workspace_id: 'w1',
    created_by: 'u1',
    provider: 'boondmanager',
    auth_mode: 'oauth2',
    credentials_enc: null,
    base_url: null,
    created_at: new Date('2026-10-01T00:00:00Z'),
    last_used_at: new Date('2026-10-02T00:00:00Z'),
    access_token_enc: encryptToken('AT-old'),
    refresh_token_enc: encryptToken('RT-old'),
    expires_at: new Date(Date.now() - 1000),
    refresh_failed_at: null,
    scopes: 'x',
    ...over,
  }
}

describe('AtsService OAuth2 — refresh', () => {
  it('jeton encore valide : aucun appel réseau, en-tête Bearer', async () => {
    const ctx = build(connectedRow({ expires_at: new Date(Date.now() + 3_600_000) }))
    const config = await ctx.svc.resolveConfigFor('u1')
    expect(config?.accessToken).toBe('AT-old')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refresh AVANT expiration (dans la marge), et le refresh tournant est RÉÉCRIT', async () => {
    const ctx = build(connectedRow({ expires_at: new Date(Date.now() + 10_000) }))
    fetchMock.mockResolvedValue(json(200, { access_token: 'AT-new', refresh_token: 'RT-new', expires_in: 900 }))
    const config = await ctx.svc.resolveConfigFor('u1')
    expect(config?.accessToken).toBe('AT-new')
    const row = ctx.row as Row
    expect(decryptToken(row.access_token_enc as string)).toBe('AT-new')
    expect(decryptToken(row.refresh_token_enc as string)).toBe('RT-new')
    expect(new URLSearchParams(fetchMock.mock.calls[0][1].body as string).get('refresh_token')).toBe('RT-old')
    expect(row.refresh_failed_at ?? null).toBeNull()
  })

  it('REFUS : refresh refusé → refresh_failed_at posé, « à reconnecter », UNE tentative, pas de boucle', async () => {
    const ctx = build(connectedRow())
    fetchMock.mockResolvedValue(json(400, { error: 'invalid_grant' }))
    expect(await ctx.svc.resolveConfigFor('u1')).toBeNull()
    expect((ctx.row as Row).refresh_failed_at).toBeInstanceOf(Date)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // les appels suivants ne retentent rien
    expect(await ctx.svc.resolveConfigFor('u1')).toBeNull()
    expect(await ctx.svc.resolveConfigFor('u1')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const status = await ctx.svc.status('u1')
    expect(status.needsReconnect).toBe(true)
    expect(status.authMode).toBe('oauth2')
  })

  it('sans refresh token et jeton expiré → à reconnecter, aucun appel réseau', async () => {
    const ctx = build(connectedRow({ refresh_token_enc: null }))
    expect(await ctx.svc.resolveConfigFor('u1')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect((await ctx.svc.status('u1')).needsReconnect).toBe(true)
  })

  it('deux lectures simultanées ne lancent qu’UN refresh (un refresh tournant ne se rejoue pas)', async () => {
    const ctx = build(connectedRow())
    fetchMock.mockImplementation(async () =>
      json(200, { access_token: 'AT-new', refresh_token: 'RT-new', expires_in: 900 }),
    )
    const [a, b] = await Promise.all([ctx.svc.resolveConfigFor('u1'), ctx.svc.resolveConfigFor('u1')])
    expect(a?.accessToken).toBe('AT-new')
    expect(b?.accessToken).toBe('AT-new')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('AtsService OAuth2 — déconnexion', () => {
  it('révoque chez Boond PUIS purge', async () => {
    const ctx = build(connectedRow({ expires_at: new Date(Date.now() + 3_600_000) }))
    const order: string[] = []
    fetchMock.mockImplementation(async (url: string) => {
      order.push(`fetch:${url}`)
      return json(200, {})
    })
    ctx.connections.delete.mockImplementation(async () => {
      order.push('delete')
    })
    await ctx.svc.disconnect('u1')
    expect(order[order.length - 1]).toBe('delete')
    const revoked = fetchMock.mock.calls.map(c => new URLSearchParams(c[1].body as string).get('token'))
    expect(revoked).toContain('RT-old')
    expect(fetchMock.mock.calls.every(c => String(c[0]).endsWith('/oauth2/revoke'))).toBe(true)
  })

  it('une révocation en échec ne retient pas l’utilisateur : la purge a lieu quand même', async () => {
    const ctx = build(connectedRow())
    fetchMock.mockRejectedValue(new Error('réseau'))
    await ctx.svc.disconnect('u1')
    expect(ctx.connections.delete).toHaveBeenCalled()
  })

  it('une connexion héritée est supprimée sans appel réseau', async () => {
    const ctx = build(
      connectedRow({
        auth_mode: 'user_token',
        access_token_enc: null,
        refresh_token_enc: null,
        credentials_enc: encryptToken('s'),
      }),
    )
    await ctx.svc.disconnect('u1')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(ctx.connections.delete).toHaveBeenCalled()
  })
})

describe('AtsService — états et héritage', () => {
  it('une connexion héritée continue de fonctionner à l’identique (Basic) et se dit « mode jeton »', async () => {
    const ctx = build(
      connectedRow({
        auth_mode: 'user_token',
        access_token_enc: null,
        refresh_token_enc: null,
        expires_at: null,
        credentials_enc: encryptToken('legacy-token'),
      }),
    )
    const config = await ctx.svc.resolveConfigFor('u1')
    expect(config?.userToken).toBe('legacy-token')
    expect(config?.accessToken).toBeUndefined()
    const status = await ctx.svc.status('u1')
    expect(status).toMatchObject({ connected: true, authMode: 'user_token', needsReconnect: false })
  })

  it('branché : donne la date du dernier échange réussi et les scopes rendus', async () => {
    const ctx = build(connectedRow({ expires_at: new Date(Date.now() + 3_600_000) }))
    expect(await ctx.svc.status('u1')).toMatchObject({
      connected: true,
      authMode: 'oauth2',
      needsReconnect: false,
      lastExchangeAt: '2026-10-02T00:00:00.000Z',
      scopes: 'x',
    })
  })
})

describe('AtsService OAuth2 — aucun jeton ne fuit', () => {
  it('ni dans un log, ni dans une réponse d’API, sur tout le cycle', async () => {
    const SECRETS = ['AT-leak', 'RT-leak', 'AT-leak2', 'RT-leak2']
    const seen: string[] = []
    for (const level of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        seen.push(JSON.stringify(args))
      })
    }
    for (const level of ['log', 'warn', 'error', 'info', 'debug'] as const) {
      jest.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        seen.push(JSON.stringify(args))
      })
    }
    const responses: unknown[] = []
    const ctx = build()
    const { url, state } = await started(ctx)
    responses.push(url, await ctx.svc.status('u1'))
    fetchMock.mockResolvedValueOnce(
      json(200, { access_token: 'AT-leak', refresh_token: 'RT-leak', expires_in: 1, scope: 's' }),
    )
    responses.push(await ctx.svc.completeOAuth('code', state), await ctx.svc.status('u1'))
    // refresh réussi
    fetchMock.mockResolvedValueOnce(json(200, { access_token: 'AT-leak2', refresh_token: 'RT-leak2', expires_in: 900 }))
    ;(ctx.row as Row).expires_at = new Date(Date.now() - 1)
    responses.push(await ctx.svc.snapshot('u1').catch(() => null), await ctx.svc.status('u1'))
    // refresh refusé (le serveur répète le jeton dans sa description : il ne doit pas ressortir)
    ;(ctx.row as Row).expires_at = new Date(Date.now() - 1)
    fetchMock.mockResolvedValueOnce(json(400, { error: 'invalid_grant', error_description: 'RT-leak2 expiré' }))
    responses.push(await ctx.svc.test('u1').catch((e: Error) => e.message), await ctx.svc.status('u1'))
    fetchMock.mockResolvedValue(json(200, {}))
    await ctx.svc.disconnect('u1')

    const out = JSON.stringify(responses) + seen.join('\n')
    for (const secret of SECRETS) expect(out).not.toContain(secret)
    expect(out).not.toContain('app-secret')
  })
})

describe('AtsService.test — meta.warnings remonté (#4688.11)', () => {
  const body = (payload: unknown) => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  })

  it('rend les avertissements de l’éditeur avec le verdict de joignabilité', async () => {
    const ctx = build(connectedRow({ expires_at: new Date(Date.now() + 3_600_000) }))
    fetchMock.mockResolvedValue(body({ data: {}, meta: { warnings: [{ code: 'appOauthRedirection' }] } }))
    expect(await ctx.svc.test('u1')).toEqual({ reachable: true, warnings: ['appOauthRedirection'] })
  })

  it('sans avertissement : liste vide, jamais une valeur inventée', async () => {
    const ctx = build(connectedRow({ expires_at: new Date(Date.now() + 3_600_000) }))
    fetchMock.mockResolvedValue(body({ data: {} }))
    expect(await ctx.svc.test('u1')).toEqual({ reachable: true, warnings: [] })
  })
})

describe('AtsService.test — démonstration (#4688.11, craft rule 9)', () => {
  it('rend l’avertissement semé, sans appel réseau', async () => {
    const ctx = build(null, { demo: true })
    expect(await ctx.svc.test('u1')).toEqual({ reachable: true, warnings: ['appOauthRedirection'] })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('AtsService — espace de démonstration (#4688, craft rule 9)', () => {
  it('montre une connexion OAuth2 « branchée » fictive, sans ligne, sans jeton, sans appel réseau', async () => {
    const ctx = build(null, { demo: true })
    const status = await ctx.svc.status('u1')
    expect(status).toMatchObject({ connected: true, authMode: 'oauth2', needsReconnect: false })
    expect(status.instanceLabel).toBeTruthy()
    expect(status.scopes).toBeTruthy()
    expect(status.lastExchangeAt).toBeTruthy()
    expect(ctx.connections.save).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await ctx.svc.resolveConfigFor('u1')).toBeNull()
  })
})

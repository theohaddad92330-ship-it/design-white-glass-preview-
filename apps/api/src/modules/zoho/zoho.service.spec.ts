import { Logger } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import type { UserActionEntity } from '../../database/entities/user-action.entity'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { decryptToken, encryptToken } from '../crm/crm-token.crypto'
import { ZohoService } from './zoho.service'

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
const makeWorkspace = () =>
  ({
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }),
  }) as unknown as jest.Mocked<WorkspaceContextService>
const makeUserActions = () =>
  ({ insert: jest.fn().mockResolvedValue(undefined) }) as unknown as jest.Mocked<Repository<UserActionEntity>>

const ENV = {
  ZOHO_CLIENT_ID: 'cid',
  ZOHO_CLIENT_SECRET: 'csecret',
  ZOHO_REDIRECT_URI: 'https://api.example.com/zoho/callback',
  INTERNAL_API_SECRET: 'internal-secret-with-entropy-123456',
  CRM_TOKEN_ENC_KEY: 'enc-key-with-enough-entropy-123456789',
}
const API = 'https://www.zohoapis.eu'

type Init = { method?: string; body?: string }
function stubFetch(handler: (url: string, init: Init) => { status?: number; body?: unknown }): jest.Mock {
  return jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL, init?: Init) => {
    const { status = 200, body = {} } = handler(String(input), init ?? {})
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  }) as never) as unknown as jest.Mock
}

function stateFor(svc: ZohoService): string {
  return new URL(svc.buildAuthorizeUrl(USER)).searchParams.get('state') ?? ''
}

describe('ZohoService (#4187)', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  it('sans clé : getStatus ne touche NI la base NI l’espace, et rien n’est proposé (aucun appel réseau)', async () => {
    delete process.env['ZOHO_CLIENT_ID']
    const fetchSpy = jest.spyOn(global, 'fetch' as never)
    const repo = makeRepo()
    const ws = makeWorkspace()
    const svc = new ZohoService(repo, makeUserActions(), ws)
    expect(await svc.getStatus(USER)).toEqual({ configured: false, connected: false })
    expect(ws.resolveActiveWorkspace).not.toHaveBeenCalled()
    expect(repo.findOne).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('l’URL de consentement porte la région configurée et un état signé', () => {
    Object.assign(process.env, ENV, { ZOHO_ACCOUNTS_REGION: 'com.au' })
    const svc = new ZohoService(makeRepo(), makeUserActions(), makeWorkspace())
    const url = new URL(svc.buildAuthorizeUrl(USER))
    expect(url.origin).toBe('https://accounts.zoho.com.au')
    expect(url.searchParams.get('state')?.split('.')).toHaveLength(2)
  })

  it('un état falsifié échoue proprement (jamais d’exception vers le navigateur)', async () => {
    Object.assign(process.env, ENV)
    const svc = new ZohoService(makeRepo(), makeUserActions(), makeWorkspace())
    await expect(svc.handleCallback('code', 'nope')).resolves.toEqual({ ok: false, reason: 'invalid_state' })
  })

  describe('« connecté » seulement après une lecture réussie', () => {
    it('le callback lit l’utilisateur courant AVANT de poser la connexion, chiffrée, avec le api_domain du token', async () => {
      Object.assign(process.env, ENV)
      const repo = makeRepo()
      const svc = new ZohoService(repo, makeUserActions(), makeWorkspace())
      const calls: string[] = []
      stubFetch(url => {
        calls.push(url)
        if (url.endsWith('/oauth/v2/token'))
          return { body: { access_token: 'AT', refresh_token: 'RT', api_domain: API, expires_in: 3600 } }
        if (url.includes('/users?type=CurrentUser'))
          return { body: { users: [{ id: '1', full_name: 'Léa', email: 'lea@exteam.fr' }] } }
        throw new Error(`unexpected ${url}`)
      })

      expect(await svc.handleCallback('code', stateFor(svc))).toEqual({ ok: true })

      expect(calls[0]).toContain('/oauth/v2/token')
      expect(calls[1]).toContain('/users?type=CurrentUser')
      const patch = (repo.insert as jest.Mock).mock.calls[0]?.[0] as Record<string, unknown>
      expect(patch['provider']).toBe('zoho')
      expect(patch['instance_url']).toBe(API)
      expect(patch['account_label']).toBe('exteam.fr')
      expect(decryptToken(patch['refresh_token_enc'] as string)).toBe('RT')
      expect(patch['access_token_enc']).not.toBe('AT')
    })

    it.each([
      ['EU', { location: 'eu', accountsServer: 'https://accounts.zoho.eu' }, 'https://accounts.zoho.eu'],
      ['US', { location: 'us', accountsServer: 'https://accounts.zoho.com' }, 'https://accounts.zoho.com'],
      ['IN', { location: 'in', accountsServer: 'https://accounts.zoho.in' }, 'https://accounts.zoho.in'],
      ['IN par location seule', { location: 'in' }, 'https://accounts.zoho.in'],
    ])(
      'L.6 — callback %s : échange du code ET région stockée sur le serveur de comptes reçu',
      async (_n, region, host) => {
        Object.assign(process.env, ENV)
        const repo = makeRepo()
        const svc = new ZohoService(repo, makeUserActions(), makeWorkspace())
        const spy = stubFetch(url =>
          url.endsWith('/oauth/v2/token')
            ? { body: { access_token: 'AT', refresh_token: 'RT', api_domain: API, expires_in: 3600 } }
            : { body: { users: [{ id: '1', full_name: 'Léa', email: 'lea@exteam.fr' }] } },
        )
        expect(await svc.handleCallback('code', stateFor(svc), region)).toEqual({ ok: true })
        expect(String(spy.mock.calls[0]?.[0])).toBe(`${host}/oauth/v2/token`)
        expect((repo.insert as jest.Mock).mock.calls[0]?.[0]['accounts_server']).toBe(host)
      },
    )

    it('⚠️ SAIT DIRE NON — un accounts-server HORS table officielle ne reçoit jamais le secret : défaut de la config', async () => {
      Object.assign(process.env, ENV)
      const repo = makeRepo()
      const svc = new ZohoService(repo, makeUserActions(), makeWorkspace())
      const spy = stubFetch(url =>
        url.endsWith('/oauth/v2/token')
          ? { body: { access_token: 'AT', refresh_token: 'RT', api_domain: API, expires_in: 3600 } }
          : { body: { users: [{ id: '1', full_name: 'Léa', email: 'lea@exteam.fr' }] } },
      )
      await svc.handleCallback('code', stateFor(svc), { accountsServer: 'https://evil.example.com' })
      expect(String(spy.mock.calls[0]?.[0])).toBe('https://accounts.zoho.eu/oauth/v2/token')
      expect((repo.insert as jest.Mock).mock.calls[0]?.[0]['accounts_server']).toBeNull()
    })

    it('⚠️ SAIT DIRE NON — si la lecture échoue, RIEN n’est posé : l’écran ne dira jamais « connecté »', async () => {
      Object.assign(process.env, ENV)
      const repo = makeRepo()
      const svc = new ZohoService(repo, makeUserActions(), makeWorkspace())
      stubFetch(url => {
        if (url.endsWith('/oauth/v2/token'))
          return { body: { access_token: 'AT', refresh_token: 'RT', api_domain: API, expires_in: 3600 } }
        return { status: 401, body: { code: 'INVALID_TOKEN' } }
      })
      expect(await svc.handleCallback('code', stateFor(svc))).toEqual({ ok: false, reason: 'read_failed' })
      expect(repo.insert).not.toHaveBeenCalled()
      expect(repo.update).not.toHaveBeenCalled()
    })

    it('⚠️ un token sans api_domain n’est PAS complété par un domaine deviné : échec nommé', async () => {
      Object.assign(process.env, ENV)
      const repo = makeRepo()
      const svc = new ZohoService(repo, makeUserActions(), makeWorkspace())
      const spy = stubFetch(() => ({ body: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 } }))
      expect(await svc.handleCallback('code', stateFor(svc))).toEqual({ ok: false, reason: 'exchange_failed' })
      expect(spy).toHaveBeenCalledTimes(1)
      expect(repo.insert).not.toHaveBeenCalled()
    })
  })

  describe('déconnexion = révocation + suppression locale', () => {
    function connected() {
      Object.assign(process.env, ENV)
      const repo = makeRepo()
      ;(repo.findOne as jest.Mock).mockResolvedValue({
        id: 'conn-1',
        provider: 'zoho',
        instance_url: API,
        access_token_enc: encryptToken('AT'),
        refresh_token_enc: encryptToken('the-refresh-token'),
        expires_at: new Date(Date.now() + 3_600_000),
      })
      return repo
    }

    it('révoque le refresh token chez le serveur de comptes de la région, puis efface la ligne', async () => {
      const repo = connected()
      const spy = stubFetch(() => ({ body: { status: 'success' } }))
      const svc = new ZohoService(repo, makeUserActions(), makeWorkspace())
      await expect(svc.disconnect(USER)).resolves.toEqual({ revoked: true, warning: null })
      expect(String(spy.mock.calls[0]?.[0])).toContain('https://accounts.zoho.eu/oauth/v2/token/revoke')
      expect(repo.delete).toHaveBeenCalledWith({ id: 'conn-1' })
    })

    it('efface QUAND MÊME si la révocation échoue, le dit, et n’écrit pas le jeton dans le journal', async () => {
      const repo = connected()
      stubFetch(() => ({ status: 500, body: {} }))
      const logged = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
      const svc = new ZohoService(repo, makeUserActions(), makeWorkspace())
      const result = await svc.disconnect(USER)
      expect(repo.delete).toHaveBeenCalledWith({ id: 'conn-1' })
      expect(result.revoked).toBe(false)
      expect(result.warning).toMatch(/n.a pas confirmé la révocation/)
      expect(JSON.stringify(logged.mock.calls)).not.toContain('the-refresh-token')
    })

    it('sans connexion : rien à effacer', async () => {
      Object.assign(process.env, ENV)
      const repo = makeRepo()
      const svc = new ZohoService(repo, makeUserActions(), makeWorkspace())
      await expect(svc.disconnect(USER)).resolves.toEqual({ revoked: true, warning: null })
      expect(repo.delete).not.toHaveBeenCalled()
    })
  })

  describe('écriture et lecture, sur le api_domain STOCKÉ', () => {
    function connectedSvc(expiresIn = 3_600_000, accountsServer: string | null = null) {
      Object.assign(process.env, ENV)
      const repo = makeRepo()
      ;(repo.findOne as jest.Mock).mockResolvedValue({
        id: 'conn-1',
        provider: 'zoho',
        instance_url: 'https://www.zohoapis.in',
        accounts_server: accountsServer,
        access_token_enc: encryptToken('AT'),
        refresh_token_enc: encryptToken('RT'),
        expires_at: new Date(Date.now() + expiresIn),
      })
      return { svc: new ZohoService(repo, makeUserActions(), makeWorkspace()), repo }
    }

    it('exportCompany retrouve la société avant de créer — jamais deux', async () => {
      const { svc } = connectedSvc()
      const spy = stubFetch(url => {
        if (url.includes('/Accounts/search')) return { body: { data: [{ id: 'a1' }] } }
        throw new Error(`unexpected ${url}`)
      })
      expect(await svc.exportCompany(USER, { name: 'TF1' })).toEqual({ id: 'a1', created: false })
      expect(String(spy.mock.calls[0]?.[0]).startsWith('https://www.zohoapis.in/crm/v6/')).toBe(true)
    })

    it('exportNeed dépose une tâche : objet « task »', async () => {
      const { svc } = connectedSvc()
      stubFetch((url, init) => {
        if (url.endsWith('/Tasks') && init.method === 'POST')
          return { status: 201, body: { data: [{ code: 'SUCCESS', details: { id: 't1' } }] } }
        return { status: 204 }
      })
      expect(await svc.exportNeed(USER, { subject: 'S', body: 'B' })).toEqual({ id: 't1', object: 'task' })
    })

    it('un jeton proche de l’expiration est rafraîchi, le refresh token reste, le api_domain stocké aussi', async () => {
      const { svc, repo } = connectedSvc(10_000)
      stubFetch(url => {
        if (url.endsWith('/oauth/v2/token')) return { body: { access_token: 'AT2', expires_in: 3600 } }
        return { body: { data: [], info: { more_records: false } } }
      })
      await svc.listContacts(USER, { limit: 10 })
      const patch = (repo.update as jest.Mock).mock.calls.find(
        ([, p]) => (p as Record<string, unknown>)['access_token_enc'],
      )?.[1] as Record<string, unknown>
      expect(decryptToken(patch['access_token_enc'] as string)).toBe('AT2')
      expect(patch['refresh_token_enc']).toBeUndefined()
    })

    it('L.6 — le refresh part vers le serveur de comptes STOCKÉ de la connexion (IN), pas vers le défaut (EU)', async () => {
      const { svc } = connectedSvc(10_000, 'https://accounts.zoho.in')
      const spy = stubFetch(url =>
        url.endsWith('/oauth/v2/token')
          ? { body: { access_token: 'AT2', expires_in: 3600 } }
          : { body: { data: [], info: { more_records: false } } },
      )
      await svc.listContacts(USER, { limit: 10 })
      expect(String(spy.mock.calls[0]?.[0])).toBe('https://accounts.zoho.in/oauth/v2/token')
    })

    it('L.6 — une connexion SANS région stockée garde le défaut de la config (aucune régression)', async () => {
      const { svc } = connectedSvc(10_000, null)
      const spy = stubFetch(url =>
        url.endsWith('/oauth/v2/token')
          ? { body: { access_token: 'AT2', expires_in: 3600 } }
          : { body: { data: [], info: { more_records: false } } },
      )
      await svc.listContacts(USER, { limit: 10 })
      expect(String(spy.mock.calls[0]?.[0])).toBe('https://accounts.zoho.eu/oauth/v2/token')
    })

    it('une connexion sans api_domain refuse de partir — jamais de domaine deviné depuis la région', async () => {
      Object.assign(process.env, ENV)
      const repo = makeRepo()
      ;(repo.findOne as jest.Mock).mockResolvedValue({
        id: 'c',
        provider: 'zoho',
        instance_url: null,
        access_token_enc: encryptToken('AT'),
        refresh_token_enc: encryptToken('RT'),
        expires_at: new Date(Date.now() + 3_600_000),
      })
      const spy = stubFetch(() => ({ body: {} }))
      const svc = new ZohoService(repo, makeUserActions(), makeWorkspace())
      await expect(svc.listContacts(USER, { limit: 1 })).rejects.toThrow(/api domain/i)
      expect(spy).not.toHaveBeenCalled()
    })
  })
})

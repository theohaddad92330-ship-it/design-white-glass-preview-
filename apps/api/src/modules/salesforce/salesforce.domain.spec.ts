import { BadRequestException } from '@nestjs/common'
import type { Response } from 'express'
import type { Repository } from 'typeorm'
import type { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import type { UserActionEntity } from '../../database/entities/user-action.entity'
import { encryptToken } from '../crm/crm-token.crypto'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { SalesforceController } from './salesforce.controller'
import { SalesforceService } from './salesforce.service'

// #4431 — Salesforce sur le domaine d'organisation PROPRE à l'espace (My Domain, sandbox).

const USER = '11111111-1111-1111-1111-111111111111'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const DOMAIN_HOST = 'https://societe.my.salesforce.com'

const ENV = {
  SALESFORCE_CLIENT_ID: 'cid',
  SALESFORCE_CLIENT_SECRET: 'csecret',
  SALESFORCE_REDIRECT_URI: 'https://api.example.com/salesforce/callback',
  INTERNAL_API_SECRET: 'internal-secret-with-entropy-123456',
  CRM_TOKEN_ENC_KEY: 'enc-key-with-enough-entropy-123456789',
}

function makeRepo(row: Partial<CrmConnectionEntity> | null = null) {
  return {
    findOne: jest.fn().mockResolvedValue(row),
    insert: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<Repository<CrmConnectionEntity>>
}

function makeService(repo: jest.Mocked<Repository<CrmConnectionEntity>>) {
  const ws = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }) }
  return new SalesforceService(
    repo,
    { insert: jest.fn() } as unknown as jest.Mocked<Repository<UserActionEntity>>,
    ws as unknown as WorkspaceContextService,
  )
}

const stateOf = (url: string) => new URL(url).searchParams.get('state') ?? ''

describe('SalesforceService — domaine d’organisation par espace (#4431)', () => {
  const OLD = { ...process.env }
  beforeEach(() => Object.assign(process.env, ENV))
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  function stubFetch(body: unknown = {}, status = 200): jest.Mock {
    return jest.spyOn(global, 'fetch' as never).mockImplementation((async () => ({
      ok: status < 300,
      status,
      json: async () => body,
    })) as never) as unknown as jest.Mock
  }

  it('SANS domaine : l’autorisation reste sur l’hôte global (comportement actuel inchangé)', () => {
    const url = new URL(makeService(makeRepo()).buildAuthorizeUrl(USER))
    expect(url.origin).toBe('https://login.salesforce.com')
  })

  it('autorise sur le domaine saisi — l’hôte Lightning est converti', () => {
    const url = new URL(makeService(makeRepo()).buildAuthorizeUrl(USER, { domain: 'societe.lightning.force.com' }))
    expect(url.origin + url.pathname).toBe(`${DOMAIN_HOST}/services/oauth2/authorize`)
  })

  it('la case sandbox vise test.salesforce.com', () => {
    const url = new URL(makeService(makeRepo()).buildAuthorizeUrl(USER, { sandbox: true }))
    expect(url.origin).toBe('https://test.salesforce.com')
  })

  it('refuse un autre hôte avec un message clair — rien ne part vers lui', () => {
    const svc = makeService(makeRepo())
    expect(() => svc.buildAuthorizeUrl(USER, { domain: 'evil.com' })).toThrow(BadRequestException)
    expect(() => svc.buildAuthorizeUrl(USER, { domain: 'evil.com' })).toThrow(/salesforce\.com.*force\.com/)
  })

  it('au retour : le jeton est demandé au domaine de l’état et le domaine est stocké sur la connexion', async () => {
    const repo = makeRepo()
    const svc = makeService(repo)
    const state = stateOf(svc.buildAuthorizeUrl(USER, { domain: 'societe.my.salesforce.com' }))
    const fetchSpy = stubFetch({ access_token: 'AT', refresh_token: 'RT', instance_url: DOMAIN_HOST })

    await expect(svc.handleCallback('code', state)).resolves.toEqual({ ok: true })

    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(`${DOMAIN_HOST}/services/oauth2/token`)
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ login_url: DOMAIN_HOST }))
  })

  it('un état falsifié ne peut pas changer de domaine (signature)', async () => {
    const svc = makeService(makeRepo())
    const [payload, sig] = stateOf(svc.buildAuthorizeUrl(USER, { domain: 'societe.my.salesforce.com' })).split('.')
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()), d: 'https://evil.com' }),
    ).toString('base64url')
    await expect(svc.handleCallback('code', `${forged}.${sig}`)).resolves.toEqual({
      ok: false,
      reason: 'invalid_state',
    })
  })

  it('SANS domaine : la connexion stockée n’a pas de domaine propre (NULL)', async () => {
    const repo = makeRepo()
    const svc = makeService(repo)
    stubFetch({ access_token: 'AT', instance_url: 'https://acme.my.salesforce.com' })
    await svc.handleCallback('code', stateOf(svc.buildAuthorizeUrl(USER)))
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ login_url: null }))
  })

  it('le rafraîchissement part sur le domaine de la connexion', async () => {
    const repo = makeRepo({
      id: 'c1',
      instance_url: DOMAIN_HOST,
      login_url: DOMAIN_HOST,
      access_token_enc: encryptToken('old'),
      refresh_token_enc: encryptToken('RT'),
      expires_at: new Date(Date.now() - 1000),
    })
    const fetchSpy = stubFetch({ access_token: 'new', expires_in: 3600 })
    const svc = makeService(repo)
    await svc.exportCompany(USER, { name: 'Acme' }).catch(() => undefined)
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(`${DOMAIN_HOST}/services/oauth2/token`)
  })

  it('la révocation part sur le domaine de la connexion', async () => {
    const repo = makeRepo({
      id: 'c1',
      login_url: DOMAIN_HOST,
      access_token_enc: encryptToken('AT'),
      refresh_token_enc: encryptToken('RT'),
    })
    const fetchSpy = stubFetch()
    await makeService(repo).disconnect(USER)
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(`${DOMAIN_HOST}/services/oauth2/revoke`)
  })

  it('un domaine stocké hors salesforce.com/force.com est ignoré (défense en profondeur)', async () => {
    const repo = makeRepo({
      id: 'c1',
      login_url: 'https://evil.com',
      access_token_enc: encryptToken('AT'),
      refresh_token_enc: encryptToken('RT'),
    })
    const fetchSpy = stubFetch()
    await makeService(repo).disconnect(USER)
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('https://login.salesforce.com/services/oauth2/revoke')
  })
})

describe('SalesforceController — l’appelant (#4431)', () => {
  const OLD = { ...process.env }
  beforeEach(() => Object.assign(process.env, ENV, { FRONTEND_URL: 'https://app.example.com' }))
  afterEach(() => {
    process.env = { ...OLD }
  })

  const user = { userId: USER } as never
  const res = () => ({ redirect: jest.fn() }) as unknown as Response & { redirect: jest.Mock }

  it('connect transmet le domaine et la case sandbox au service', () => {
    const service = { buildAuthorizeUrl: jest.fn().mockReturnValue('https://x') }
    const controller = new SalesforceController(service as never)
    controller.connect(user, { domain: 'societe.lightning.force.com', sandbox: 'true' })
    expect(service.buildAuthorizeUrl).toHaveBeenCalledWith(USER, {
      domain: 'societe.lightning.force.com',
      sandbox: true,
    })
  })

  it('l’erreur rendue par Salesforce au retour est transmise en clair, jamais un échec muet', async () => {
    const service = { handleCallback: jest.fn() }
    const r = res()
    await new SalesforceController(service as never).callback(
      undefined,
      'st',
      'access_denied',
      'user is not admin approved to access this app',
      r,
    )
    expect(service.handleCallback).not.toHaveBeenCalled()
    const target = String(r.redirect.mock.calls[0]?.[0])
    expect(target).toContain('https://app.example.com/integrations?salesforce=error')
    expect(decodeURIComponent(target)).toContain('user is not admin approved to access this app')
  })

  it('l’erreur sans description retombe sur le code d’erreur', async () => {
    const r = res()
    await new SalesforceController({} as never).callback(undefined, 'st', 'access_denied', undefined, r)
    expect(decodeURIComponent(String(r.redirect.mock.calls[0]?.[0]))).toContain('reason=access_denied')
  })
})

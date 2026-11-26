import { AtsCredentialsService } from '../ats/ats-credentials.service'
import { encryptToken } from '../crm/crm-token.crypto'
import { ZeroLayerService } from './zero-layer.service'
import type { GoogleService } from '../google/google.service'
import type { MicrosoftService } from '../microsoft/microsoft.service'
import type { NotionService } from '../notion/notion.service'

/**
 * L'orchestrateur de la couche zéro (annexe méthodo p8).
 *
 * Ce qui se teste ici n'est pas le contenu des sources — c'est la SÛRETÉ :
 * une analyse ne doit jamais échouer, ni changer de comportement, à cause d'une
 * intégration absente, lente ou cassée.
 */

const ACCOUNT = { companyName: 'ACME Industries', domain: 'acme.com' }

function googleStub(over: Partial<GoogleService> = {}): GoogleService {
  return {
    hasCapability: jest.fn().mockResolvedValue(true),
    listDriveFiles: jest.fn().mockResolvedValue({ files: [] }),
    listGmailWithDomain: jest.fn().mockResolvedValue([]),
    ...over,
  } as unknown as GoogleService
}

describe('ZeroLayerService — sûreté', () => {
  it('rend `undefined` quand AUCUNE intégration n’est branchée', async () => {
    // Le cas de l'immense majorité des workspaces : le run doit être
    // byte-identique à ce qu'il était avant la feature.
    const service = new ZeroLayerService()
    await expect(service.describeInternalHistory('u1', ACCOUNT)).resolves.toBeUndefined()
  })

  it('ne cherche RIEN quand le nom du compte est trop court', async () => {
    const google = googleStub()
    const service = new ZeroLayerService(google)
    await expect(service.describeInternalHistory('u1', { companyName: 'SG' })).resolves.toBeUndefined()
    expect(google.listDriveFiles).not.toHaveBeenCalled()
  })

  it('n’appelle PAS Drive quand le scope n’est pas accordé', async () => {
    // Un token émis avant l'ajout du scope ne doit pas provoquer un 403 : la
    // source se saute, elle n'échoue pas.
    const google = googleStub({ hasCapability: jest.fn().mockResolvedValue(false) as never })
    const service = new ZeroLayerService(google)
    await expect(service.describeInternalHistory('u1', ACCOUNT)).resolves.toBeUndefined()
    expect(google.listDriveFiles).not.toHaveBeenCalled()
  })

  it('rend les trouvailles quand une source répond', async () => {
    const google = googleStub({
      listDriveFiles: jest.fn().mockResolvedValue({
        files: [{ id: '1', name: 'ACME — proposition.docx', modifiedTime: '2026-02-01T00:00:00Z' }],
      }) as never,
    })
    const block = await new ZeroLayerService(google).describeInternalHistory('u1', ACCOUNT)
    expect(block).toContain('ACME — proposition.docx')
    expect(block).toContain('2026-02-01')
  })

  it('une source qui EXPLOSE ne fait pas tomber les autres', async () => {
    // La propriété qui compte le plus : un Drive indisponible ne doit jamais
    // empêcher une analyse de partir.
    const google = googleStub({
      listDriveFiles: jest.fn().mockRejectedValue(new Error('Drive down')) as never,
    })
    const notion = {
      listPages: jest.fn().mockResolvedValue([{ id: 'p1', title: 'CR réunion ACME', type: 'page', url: null }]),
    } as unknown as NotionService

    const block = await new ZeroLayerService(google, notion).describeInternalHistory('u1', ACCOUNT)
    expect(block).toContain('CR réunion ACME')
    expect(block).not.toContain('proposition')
  })

  it('rend `undefined` quand TOUTES les sources échouent', async () => {
    const google = googleStub({
      listDriveFiles: jest.fn().mockRejectedValue(new Error('nope')) as never,
      listGmailWithDomain: jest.fn().mockRejectedValue(new Error('nope')) as never,
    })
    const microsoft = { searchMailbox: jest.fn().mockRejectedValue(new Error('nope')) } as unknown as MicrosoftService
    await expect(
      new ZeroLayerService(google, undefined, microsoft).describeInternalHistory('u1', ACCOUNT),
    ).resolves.toBeUndefined()
  })

  it('saute Gmail sans domaine — chercher un nom d’entreprise ramène des newsletters', async () => {
    const google = googleStub()
    await new ZeroLayerService(google).describeInternalHistory('u1', { companyName: 'ACME Industries' })
    expect(google.listGmailWithDomain).not.toHaveBeenCalled()
  })

  it('dédoublonne un document ramené par deux termes de recherche', async () => {
    const google = googleStub({
      listDriveFiles: jest
        .fn()
        .mockResolvedValue({ files: [{ id: '1', name: 'Dossier ACME', modifiedTime: null }] }) as never,
    })
    const block = (await new ZeroLayerService(google).describeInternalHistory('u1', ACCOUNT)) ?? ''
    expect(block.match(/Dossier ACME/g)).toHaveLength(1)
  })
})

/**
 * #4687 — l'ATS de l'analyse est celui de l'ESPACE du compte, pas la variable d'environnement.
 * La vraie résolution (`AtsCredentialsService`) sur un dépôt factice ; seul le réseau est simulé.
 */
describe('ZeroLayerService — ATS par espace (#4687)', () => {
  const ENV = ['BOONDMANAGER_USER_TOKEN', 'BOONDMANAGER_CLIENT_TOKEN', 'BOONDMANAGER_CLIENT_KEY', 'INTERNAL_API_SECRET']
  const saved: Record<string, string | undefined> = {}
  const realFetch = global.fetch
  const fetchMock = jest.fn()

  // Le chemin sortant unique (#4693) lit le corps par `text()` et les en-têtes : le simulacre rend les deux.
  const ok = (body: unknown) => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    text: async () => JSON.stringify(body),
    json: async () => body,
  })
  const basic = (token: string) => `Basic ${Buffer.from(`${token}:`).toString('base64')}`

  function build(rows: Record<string, Record<string, unknown>>) {
    const connections = {
      findOne: jest.fn(async ({ where }: { where: { workspace_id: string } }) => rows[where.workspace_id] ?? null),
      update: jest.fn(),
    }
    const credentials = new AtsCredentialsService(connections as never)
    return { service: new ZeroLayerService(undefined, undefined, undefined, undefined, credentials), connections }
  }
  const rowOf = (token: string) => ({
    id: 'c',
    auth_mode: 'user_token',
    credentials_enc: encryptToken(token),
    base_url: null,
  })
  const authHeaders = () =>
    fetchMock.mock.calls.map(call => (call[1] as { headers: Record<string, string> }).headers['Authorization'])

  beforeEach(() => {
    for (const k of ENV) saved[k] = process.env[k]
    process.env['INTERNAL_API_SECRET'] = 'test-secret'
    for (const k of ENV.slice(0, 3)) delete process.env[k]
    fetchMock.mockReset()
    global.fetch = fetchMock as never
  })
  afterEach(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    global.fetch = realFetch
  })

  it('REFUS : l’espace B non branché fait ZÉRO appel à l’éditeur, même quand A l’est', async () => {
    const { service } = build({ A: rowOf('token-A') })
    const block = await service.describeInternalHistory('u', { ...ACCOUNT, workspaceId: 'B' })
    expect(block).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('REFUS : sans espace connu, ni ligne ni environnement ⇒ zéro appel', async () => {
    const { service } = build({ A: rowOf('token-A') })
    expect(await service.describeInternalHistory('u', ACCOUNT)).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('l’espace A branché lit l’ATS avec SES identifiants — et ceux de A ne partent jamais pour B', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      ok(String(url).includes('/companies') ? [{ id: 7, name: 'ACME Industries' }] : []),
    )
    process.env['BOONDMANAGER_USER_TOKEN'] = 'token-ENV'
    const { service } = build({ A: rowOf('token-A'), B: rowOf('token-B') })

    const forA = await service.describeInternalHistory('u', { ...ACCOUNT, workspaceId: 'A' })
    expect(forA).toContain('Société connue de l’ATS'.replace('’', "'"))
    expect(new Set(authHeaders())).toEqual(new Set([basic('token-A')]))

    fetchMock.mockClear()
    await service.describeInternalHistory('u', { ...ACCOUNT, workspaceId: 'B' })
    expect(new Set(authHeaders())).toEqual(new Set([basic('token-B')]))
    expect(authHeaders()).not.toContain(basic('token-A'))
    expect(authHeaders()).not.toContain(basic('token-ENV'))
  })

  it('l’environnement ne sert qu’À DÉFAUT de ligne pour l’espace', async () => {
    fetchMock.mockResolvedValue(ok([]))
    process.env['BOONDMANAGER_USER_TOKEN'] = 'token-ENV'
    const { service } = build({ A: rowOf('token-A') })
    await service.describeInternalHistory('u', { ...ACCOUNT, workspaceId: 'B' })
    expect(new Set(authHeaders())).toEqual(new Set([basic('token-ENV')]))
  })

  it('l’éditeur en timeout rend [] : l’analyse se termine avec ses autres sources', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    const google = googleStub({
      listDriveFiles: jest
        .fn()
        .mockResolvedValue({ files: [{ name: 'Proposition ACME', modifiedTime: '2026-01-01' }] }),
    } as never)
    const { service: base } = build({ A: rowOf('token-A') })
    const credentials = (base as unknown as { atsConfig: AtsCredentialsService }).atsConfig
    const service = new ZeroLayerService(google, undefined, undefined, undefined, credentials)
    const block = (await service.describeInternalHistory('u', { ...ACCOUNT, workspaceId: 'A' })) ?? ''
    expect(fetchMock).toHaveBeenCalled()
    expect(block).toContain('Proposition ACME')
    expect(block).not.toContain('ATS')
  })

  it('une résolution qui explose (ligne illisible) vaut « pas d’ATS », pas une analyse en échec', async () => {
    const { service } = build({ A: { ...rowOf('x'), credentials_enc: 'pas-un-chiffre' } })
    await expect(service.describeInternalHistory('u', { ...ACCOUNT, workspaceId: 'A' })).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

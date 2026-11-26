import { ZohoController } from './zoho.controller'

const ENV_KEYS = ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REDIRECT_URI', 'FRONTEND_URL'] as const

function build(result: { ok: boolean; reason?: string }) {
  const zoho = { handleCallback: jest.fn(async () => result) }
  const redirect = jest.fn()
  return { controller: new ZohoController(zoho as never), zoho, res: { redirect } as never, redirect }
}

describe('ZohoController.callback (#4187)', () => {
  const OLD = { ...process.env }
  beforeEach(() => {
    process.env['ZOHO_CLIENT_ID'] = 'cid'
    process.env['ZOHO_CLIENT_SECRET'] = 'csecret'
    process.env['ZOHO_REDIRECT_URI'] = 'https://api.example.com/zoho/callback'
    process.env['FRONTEND_URL'] = 'https://app.example.com'
  })
  afterEach(() => {
    for (const key of ENV_KEYS) process.env[key] = OLD[key] as string
    process.env = { ...OLD }
  })

  it('« connected » n’est écrit dans l’URL de retour que si le serveur a réussi (lecture comprise)', async () => {
    const { controller, res, redirect } = build({ ok: true })
    await controller.callback('code', 'state', undefined, undefined, undefined, res)
    expect(redirect).toHaveBeenCalledWith('https://app.example.com/integrations?zoho=connected')
  })

  it('⚠️ une lecture refusée rebondit en erreur nommée — jamais « connected »', async () => {
    const { controller, res, redirect } = build({ ok: false, reason: 'read_failed' })
    await controller.callback('code', 'state', undefined, undefined, undefined, res)
    const reason = new URL(redirect.mock.calls[0][0]).searchParams.get('reason')
    expect(redirect.mock.calls[0][0]).toContain('zoho=error&reason=')
    expect(reason).toMatch(/lecture/i)
  })

  it('sans code ou sans état (refus chez Zoho) : erreur nommée, aucun appel au service', async () => {
    const { controller, res, redirect, zoho } = build({ ok: true })
    await controller.callback(undefined, 'state', undefined, undefined, undefined, res)
    expect(redirect.mock.calls[0][0]).toContain('zoho=error&reason=')
    expect(zoho.handleCallback).not.toHaveBeenCalled()
  })

  it('L.6 — la région rendue par Zoho (location, accounts-server) est transmise au service', async () => {
    const { controller, res, zoho } = build({ ok: true })
    await controller.callback('code', 'state', 'in', 'https://accounts.zoho.in', undefined, res)
    expect(zoho.handleCallback).toHaveBeenCalledWith('code', 'state', {
      location: 'in',
      accountsServer: 'https://accounts.zoho.in',
    })
  })

  it('#4380 — le refus de Zoho (invalid_client) nomme le centre de données et l’URI de redirection attendus, jamais la clé', async () => {
    process.env['ZOHO_ACCOUNTS_REGION'] = 'eu'
    const { controller, res, redirect, zoho } = build({ ok: true })
    await controller.callback(undefined, 'state', undefined, undefined, 'invalid_client', res)
    const url = new URL(redirect.mock.calls[0][0])
    const reason = url.searchParams.get('reason') ?? ''
    expect(reason).toContain('accounts.zoho.eu')
    expect(reason).toContain('https://api.example.com/zoho/callback')
    expect(reason).toMatch(/Multi-DC/)
    expect(redirect.mock.calls[0][0]).not.toContain('csecret')
    expect(reason).not.toContain('cid')
    expect(zoho.handleCallback).not.toHaveBeenCalled()
  })

  it('#4380 — access_denied (l’utilisateur refuse) est dit comme un refus, sans accuser la configuration', async () => {
    const { controller, res, redirect } = build({ ok: true })
    await controller.callback(undefined, 'state', undefined, undefined, 'access_denied', res)
    const reason = new URL(redirect.mock.calls[0][0]).searchParams.get('reason') ?? ''
    expect(reason).toMatch(/refus/i)
    expect(reason).not.toMatch(/Multi-DC/)
  })
})

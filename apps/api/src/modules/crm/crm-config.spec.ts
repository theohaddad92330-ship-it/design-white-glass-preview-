import { frontendOrigin, readHubspotConfig } from './crm-config'

describe('frontendOrigin', () => {
  const original = process.env['FRONTEND_URL']
  afterEach(() => {
    if (original === undefined) delete process.env['FRONTEND_URL']
    else process.env['FRONTEND_URL'] = original
  })

  it('returns a single FRONTEND_URL unchanged', () => {
    process.env['FRONTEND_URL'] = 'https://bellum-ai.com'
    expect(frontendOrigin()).toBe('https://bellum-ai.com')
  })

  it('takes the first entry of a comma-separated FRONTEND_URL (domain migration)', () => {
    // cors-origins.ts reads the same var as a multi-origin list; the OAuth
    // redirect must resolve to exactly one URL, not the raw comma string.
    process.env['FRONTEND_URL'] = 'https://bellum-ai.com, https://app.bellum-ai.com'
    expect(frontendOrigin()).toBe('https://bellum-ai.com')
  })

  it('skips leading empty entries', () => {
    process.env['FRONTEND_URL'] = ' , https://app.bellum-ai.com'
    expect(frontendOrigin()).toBe('https://app.bellum-ai.com')
  })

  it('falls back to localhost when unset or blank', () => {
    delete process.env['FRONTEND_URL']
    expect(frontendOrigin()).toBe('http://localhost:3000')
    process.env['FRONTEND_URL'] = '   '
    expect(frontendOrigin()).toBe('http://localhost:3000')
  })
})

describe('readHubspotConfig frontendUrl', () => {
  const keys = ['HUBSPOT_CLIENT_ID', 'HUBSPOT_CLIENT_SECRET', 'HUBSPOT_REDIRECT_URI', 'FRONTEND_URL'] as const
  const saved: Record<string, string | undefined> = {}
  beforeEach(() => {
    for (const k of keys) saved[k] = process.env[k]
  })
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('uses the first FRONTEND_URL origin as the OAuth redirect base', () => {
    process.env['HUBSPOT_CLIENT_ID'] = 'cid'
    process.env['HUBSPOT_CLIENT_SECRET'] = 'secret'
    process.env['HUBSPOT_REDIRECT_URI'] = 'https://api.example.com/crm/hubspot/callback'
    process.env['FRONTEND_URL'] = 'https://bellum-ai.com,https://app.bellum-ai.com'
    expect(readHubspotConfig()?.frontendUrl).toBe('https://bellum-ai.com')
  })
})

// #4065.8 (18/10) — l'app HubSpot publiée n'accordait que les portées contacts : le code
// demandait sociétés et affaires, HubSpot ne les donnait pas, et « affaires perdues » rendait vide.
// Le manifest `hs project` doit déclarer EXACTEMENT les portées que le code demande.
describe('HubSpot app manifest', () => {
  const keys = ['HUBSPOT_CLIENT_ID', 'HUBSPOT_CLIENT_SECRET', 'HUBSPOT_REDIRECT_URI', 'HUBSPOT_SCOPES'] as const
  const saved: Record<string, string | undefined> = {}
  beforeEach(() => {
    for (const k of keys) saved[k] = process.env[k]
    process.env['HUBSPOT_CLIENT_ID'] = 'id'
    process.env['HUBSPOT_CLIENT_SECRET'] = 'secret'
    process.env['HUBSPOT_REDIRECT_URI'] = 'https://example.test/crm/hubspot/callback'
    delete process.env['HUBSPOT_SCOPES']
  })
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('declares as required every scope the OAuth URL asks for', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const manifest = require('../../../hubspot-app/src/app/app-hsmeta.json') as {
      config: { auth: { requiredScopes: string[] } }
    }
    const asked = (readHubspotConfig()?.scopes ?? '').split(/\s+/).filter(Boolean).sort()
    expect([...manifest.config.auth.requiredScopes].sort()).toEqual(asked)
  })

  it('asks for companies.write — « Envoyer vers mon CRM » crée la société (hubspot-depth.client.ts createCompany)', () => {
    // #4065.8 (18/10) — en prod : « HubSpot create company failed: This app hasn't been granted all required scopes ».
    expect((readHubspotConfig()?.scopes ?? '').split(/\s+/)).toContain('crm.objects.companies.write')
  })
})

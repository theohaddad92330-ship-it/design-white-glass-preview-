import { readZohoConfig, ZOHO_SCOPES } from './zoho-config'
import { ZohoClient } from './zoho.client'

type Init = { method?: string; body?: unknown; headers?: Record<string, string> }
type Reply = { status?: number; body?: unknown }

function stubFetch(handler: (url: string, init: Init) => Reply): jest.Mock {
  return jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL, init?: Init) => {
    const { status = 200, body = {} } = handler(String(input), init ?? {})
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  }) as never) as unknown as jest.Mock
}

const config = {
  clientId: 'cid',
  clientSecret: 'csecret',
  redirectUri: 'https://api.example.com/zoho/callback',
  accountsUrl: 'https://accounts.zoho.eu',
  region: 'eu',
  frontendUrl: 'https://app',
}
const client = new ZohoClient(config)
const API = 'https://www.zohoapis.eu'

const ENV = {
  ZOHO_CLIENT_ID: 'cid',
  ZOHO_CLIENT_SECRET: 'csecret',
  ZOHO_REDIRECT_URI: 'https://api.example.com/zoho/callback',
}

describe('readZohoConfig (#4187)', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
  })

  it('sans les trois clés : null — aucun appel réseau, le fournisseur n’est pas proposé', () => {
    for (const key of Object.keys(ENV)) delete process.env[key]
    expect(readZohoConfig()).toBeNull()
    Object.assign(process.env, ENV, { ZOHO_CLIENT_SECRET: '  ' })
    expect(readZohoConfig()).toBeNull()
  })

  it('la région vaut eu par défaut ; .com, .in et .com.au sont possibles', () => {
    Object.assign(process.env, ENV)
    delete process.env['ZOHO_ACCOUNTS_REGION']
    expect(readZohoConfig()?.accountsUrl).toBe('https://accounts.zoho.eu')
    for (const [region, host] of [
      ['com', 'https://accounts.zoho.com'],
      ['in', 'https://accounts.zoho.in'],
      ['com.au', 'https://accounts.zoho.com.au'],
      ['.COM', 'https://accounts.zoho.com'],
    ] as const) {
      process.env['ZOHO_ACCOUNTS_REGION'] = region
      expect(readZohoConfig()?.accountsUrl).toBe(host)
    }
  })

  it('⚠️ SAIT DIRE NON — une région inconnue n’est PAS ramenée à eu : le fournisseur n’est pas proposé', () => {
    Object.assign(process.env, ENV, { ZOHO_ACCOUNTS_REGION: 'jp-typo' })
    expect(readZohoConfig()).toBeNull()
  })

  it('les scopes minimaux sont exactement ceux du brief', () => {
    expect([...ZOHO_SCOPES]).toEqual([
      'ZohoCRM.modules.accounts.ALL',
      'ZohoCRM.modules.contacts.ALL',
      'ZohoCRM.modules.deals.READ',
      'ZohoCRM.modules.tasks.CREATE',
      'ZohoCRM.modules.notes.CREATE',
      'ZohoCRM.users.READ',
    ])
  })
})

describe('ZohoClient — OAuth', () => {
  afterEach(() => jest.restoreAllMocks())

  it('l’URL de consentement vise le serveur de comptes de la région, demande offline + les scopes', () => {
    const url = new URL(client.authorizeUrl('signed-state'))
    expect(url.origin + url.pathname).toBe('https://accounts.zoho.eu/oauth/v2/auth')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('signed-state')
    expect(url.searchParams.get('scope')).toBe(ZOHO_SCOPES.join(','))
  })

  it('#4380 — l’URL envoyée à Zoho : hôte de la région, redirect_uri EXACT (encodé), client_id tel quel ; .com si la région est com', () => {
    const eu = new URL(client.authorizeUrl('s'))
    expect(eu.host).toBe('accounts.zoho.eu')
    expect(eu.searchParams.get('redirect_uri')).toBe('https://api.example.com/zoho/callback')
    expect(eu.searchParams.get('client_id')).toBe('cid')
    expect(client.authorizeUrl('s')).toContain('redirect_uri=https%3A%2F%2Fapi.example.com%2Fzoho%2Fcallback')
    Object.assign(process.env, ENV, { ZOHO_ACCOUNTS_REGION: 'com' })
    const cfg = readZohoConfig()
    delete process.env['ZOHO_ACCOUNTS_REGION']
    expect(new URL(new ZohoClient(cfg!).authorizeUrl('s')).host).toBe('accounts.zoho.com')
  })

  it('l’échange du code renvoie le api_domain DU TOKEN — jamais deviné', async () => {
    const spy = stubFetch(() => ({
      body: { access_token: 'at', refresh_token: 'rt', api_domain: 'https://www.zohoapis.in', expires_in: 3600 },
    }))
    const tokens = await client.exchangeCode('the-code')
    expect(tokens).toMatchObject({ accessToken: 'at', refreshToken: 'rt', apiDomain: 'https://www.zohoapis.in' })
    expect(String(spy.mock.calls[0]?.[0])).toBe('https://accounts.zoho.eu/oauth/v2/token')
  })

  it('L.6 — échange, refresh et révocation vont au serveur de comptes de LA connexion', async () => {
    const spy = stubFetch(() => ({ body: { access_token: 'at', status: 'success' } }))
    await client.exchangeCode('c', 'https://accounts.zoho.com.au')
    await client.refresh('rt', 'https://accounts.zoho.in')
    await client.revoke('rt', 'https://accounts.zohocloud.ca')
    expect(spy.mock.calls.map(c => String(c[0]).split('?')[0])).toEqual([
      'https://accounts.zoho.com.au/oauth/v2/token',
      'https://accounts.zoho.in/oauth/v2/token',
      'https://accounts.zohocloud.ca/oauth/v2/token/revoke',
    ])
  })

  // #4380.2 — le domaine d'API reçoit le jeton d'accès : liste blanche stricte, jamais une URL arbitraire.
  it('⚠️ SAIT DIRE NON — un api_domain hors liste blanche zohoapis.* est refusé (SSRF)', async () => {
    for (const bad of [
      'https://evil.example.com',
      'https://www.zohoapis.eu.evil.com',
      'http://www.zohoapis.eu',
      'https://www.zohoapis.eu@evil.com',
      'https://169.254.169.254',
    ]) {
      stubFetch(() => ({ body: { access_token: 'at', api_domain: bad, expires_in: 3600 } }))
      expect((await client.exchangeCode('c')).apiDomain).toBeNull()
    }
  })

  it('#4380.2 — chaque région a son api_domain accepté (EU, COM, IN, AU, JP…), normalisé sans « / » final', async () => {
    for (const ok of [
      'https://www.zohoapis.eu',
      'https://www.zohoapis.com/',
      'https://www.zohoapis.in',
      'https://www.zohoapis.com.au',
      'https://www.zohoapis.jp',
      'https://www.zohoapis.ca',
      'https://www.zohoapis.sa',
      'https://www.zohoapis.com.cn',
    ]) {
      stubFetch(() => ({ body: { access_token: 'at', api_domain: ok, expires_in: 3600 } }))
      expect((await client.exchangeCode('c')).apiDomain).toBe(ok.replace(/\/+$/, ''))
    }
  })

  it('une réponse sans api_domain n’invente pas de domaine : null', async () => {
    stubFetch(() => ({ body: { access_token: 'at', refresh_token: 'rt', expires_in: 3600 } }))
    expect((await client.exchangeCode('c')).apiDomain).toBeNull()
  })

  it('⚠️ Zoho répond 200 avec { error } : c’est un échec, pas un jeton vide', async () => {
    stubFetch(() => ({ status: 200, body: { error: 'invalid_code' } }))
    await expect(client.exchangeCode('c')).rejects.toThrow(/invalid_code/)
  })

  it('le rafraîchissement garde le refresh token (Zoho n’en renvoie pas de nouveau)', async () => {
    stubFetch(() => ({ body: { access_token: 'at2', api_domain: API, expires_in: 3600 } }))
    const tokens = await client.refresh('rt-old')
    expect(tokens.accessToken).toBe('at2')
    expect(tokens.refreshToken).toBe('rt-old')
  })

  it('la révocation vise {accounts}/oauth/v2/token/revoke avec le refresh token ; un échec est une erreur', async () => {
    const spy = stubFetch(() => ({ body: { status: 'success' } }))
    await client.revoke('rt-1')
    const [url, init] = spy.mock.calls[0] as [string, Init]
    expect(url.startsWith('https://accounts.zoho.eu/oauth/v2/token/revoke')).toBe(true)
    expect(url).toContain('token=rt-1')
    expect(init.method).toBe('POST')

    stubFetch(() => ({ status: 200, body: { status: 'failure' } }))
    await expect(client.revoke('rt-1')).rejects.toThrow(/revocation/i)
    stubFetch(() => ({ status: 500, body: {} }))
    await expect(client.revoke('rt-1')).rejects.toThrow(/revocation/i)
  })
})

describe('ZohoClient — REST v6', () => {
  afterEach(() => jest.restoreAllMocks())

  it('le test de connexion lit l’utilisateur courant', async () => {
    const spy = stubFetch(() => ({ body: { users: [{ id: '1', full_name: 'Léa Martin', email: 'lea@exteam.fr' }] } }))
    const me = await client.currentUser('tok', API)
    expect(me).toEqual({ id: '1', name: 'Léa Martin', email: 'lea@exteam.fr' })
    const [url, init] = spy.mock.calls[0] as [string, Init]
    expect(url).toBe(`${API}/crm/v6/users?type=CurrentUser`)
    expect(init.headers?.['Authorization']).toBe('Zoho-oauthtoken tok')
  })

  it('un contact connu par son e-mail est MIS À JOUR, pas dupliqué', async () => {
    const spy = stubFetch((url, init) => {
      if (url.includes('/Contacts/search')) return { body: { data: [{ id: 'c1' }] } }
      if (url.endsWith('/Contacts/c1') && init.method === 'PUT')
        return { body: { data: [{ code: 'SUCCESS', details: { id: 'c1' } }] } }
      throw new Error(`unexpected ${init.method} ${url}`)
    })
    const result = await client.upsertContact('tok', API, { email: 'a@b.fr', firstName: 'Ana', lastName: 'Roy' })
    expect(result).toEqual({ id: 'c1', created: false })
    expect(spy.mock.calls.some(([, i]) => (i as Init).method === 'POST')).toBe(false)
    expect(decodeURIComponent(String(spy.mock.calls[0]?.[0]))).toContain('(Email:equals:a@b.fr)')
  })

  it('un contact inconnu est créé (Last_Name obligatoire), lié à la société retrouvée', async () => {
    const spy = stubFetch((url, init) => {
      if (url.includes('/Accounts/search')) return { body: { data: [{ id: 'a9' }] } }
      if (url.includes('/Contacts/search')) return { status: 204, body: {} }
      if (url.endsWith('/Contacts') && init.method === 'POST')
        return { status: 201, body: { data: [{ code: 'SUCCESS', details: { id: 'c2' } }] } }
      throw new Error(`unexpected ${init.method} ${url}`)
    })
    const result = await client.upsertContact('tok', API, {
      email: 'a@b.fr',
      firstName: 'Ana',
      lastName: 'Roy',
      company: 'TF1',
      jobTitle: 'DSI',
      phone: '+33102030405',
    })
    expect(result).toEqual({ id: 'c2', created: true })
    const post = spy.mock.calls.find(([, i]) => (i as Init).method === 'POST')
    const row = (JSON.parse(String((post?.[1] as Init).body)) as { data: Array<Record<string, unknown>> }).data[0]
    expect(row).toMatchObject({
      Last_Name: 'Roy',
      First_Name: 'Ana',
      Email: 'a@b.fr',
      Title: 'DSI',
      Phone: '+33102030405',
      Account_Name: { id: 'a9' },
    })
  })

  it('⚠️ un contact sans nom NI adresse est refusé — jamais un « Contact » inventé', async () => {
    stubFetch(() => ({ body: {} }))
    await expect(client.upsertContact('tok', API, { company: 'TF1' })).rejects.toThrow(/ni nom ni adresse/)
  })

  it('⚠️ Zoho répond 200 avec un échec par ligne : l’écriture n’est PAS un succès', async () => {
    stubFetch((url, init) => {
      if (url.includes('/search')) return { status: 204, body: {} }
      if (init.method === 'POST')
        return {
          status: 200,
          body: { data: [{ code: 'MANDATORY_NOT_FOUND', message: 'required field not found', status: 'error' }] },
        }
      throw new Error('unexpected')
    })
    await expect(client.upsertContact('tok', API, { email: 'a@b.fr', lastName: 'Roy' })).rejects.toThrow(
      /MANDATORY_NOT_FOUND/,
    )
  })

  it('une société retrouvée par son nom exact n’est pas recréée ; sinon créée (Account_Name, Website)', async () => {
    stubFetch(() => ({ body: { data: [{ id: 'a1' }] } }))
    expect(await client.findOrCreateAccount('tok', API, { name: 'TF1' })).toEqual({ id: 'a1', created: false })

    const spy = stubFetch((url, init) => {
      if (url.includes('/Accounts/search')) return { status: 204, body: {} }
      if (init.method === 'POST') return { status: 201, body: { data: [{ code: 'SUCCESS', details: { id: 'a2' } }] } }
      throw new Error('unexpected')
    })
    expect(await client.findOrCreateAccount('tok', API, { name: 'M6', website: 'm6.fr' })).toEqual({
      id: 'a2',
      created: true,
    })
    const post = spy.mock.calls.find(([, i]) => (i as Init).method === 'POST')
    expect(JSON.parse(String((post?.[1] as Init).body))).toEqual({ data: [{ Account_Name: 'M6', Website: 'm6.fr' }] })
  })

  it('la valeur d’un critère de recherche échappe parenthèses et barre oblique', async () => {
    const spy = stubFetch(() => ({ status: 204, body: {} }))
    await client.findAccountIdByName('tok', API, 'A (B) \\ C')
    expect(decodeURIComponent(String(spy.mock.calls[0]?.[0]).replace(/\+/g, ' '))).toContain(
      '(Account_Name:equals:A \\(B\\) \\\\ C)',
    )
  })

  it('un besoin devient une TÂCHE (Subject, échéance réelle) liée à la société, + une note best-effort', async () => {
    const spy = stubFetch((url, init) => {
      if (url.includes('/Accounts/search')) return { body: { data: [{ id: 'a1' }] } }
      if (url.endsWith('/Tasks') && init.method === 'POST')
        return { status: 201, body: { data: [{ code: 'SUCCESS', details: { id: 't1' } }] } }
      if (url.endsWith('/Accounts/a1/Notes') && init.method === 'POST')
        return { status: 201, body: { data: [{ code: 'SUCCESS', details: { id: 'n1' } }] } }
      throw new Error(`unexpected ${init.method} ${url}`)
    })
    const result = await client.createTask('tok', API, {
      subject: 'Besoin — TF1 : Régie',
      body: 'Détail',
      company: 'TF1',
      dueDate: '2026-11-02',
    })
    expect(result).toEqual({ id: 't1' })
    const task = spy.mock.calls.find(([u]) => String(u).endsWith('/Tasks'))
    const row = (JSON.parse(String((task?.[1] as Init).body)) as { data: Array<Record<string, unknown>> }).data[0]
    expect(row).toMatchObject({
      Subject: 'Besoin — TF1 : Régie',
      Description: 'Détail',
      Due_Date: '2026-11-02',
      What_Id: { id: 'a1' },
      $se_module: 'Accounts',
    })
  })

  it('sans échéance connue, aucune Due_Date n’est inventée ; une note qui échoue n’annule pas la tâche', async () => {
    const spy = stubFetch((url, init) => {
      if (url.endsWith('/Tasks') && init.method === 'POST')
        return { status: 201, body: { data: [{ code: 'SUCCESS', details: { id: 't2' } }] } }
      if (url.includes('/Notes')) return { status: 400, body: {} }
      if (url.includes('/Accounts/search')) return { body: { data: [{ id: 'a1' }] } }
      throw new Error('unexpected')
    })
    expect(await client.createTask('tok', API, { subject: 'S', body: 'B', company: 'TF1' })).toEqual({ id: 't2' })
    const task = spy.mock.calls.find(([u]) => String(u).endsWith('/Tasks'))
    const row = (JSON.parse(String((task?.[1] as Init).body)) as { data: Array<Record<string, unknown>> }).data[0]
    expect(row).not.toHaveProperty('Due_Date')
  })
})

describe('ZohoClient — lecture', () => {
  afterEach(() => jest.restoreAllMocks())

  it('les comptes : fields explicites (v6 l’exige), tri par modification, curseur page puis page_token', async () => {
    const spy = stubFetch(() => ({
      body: {
        data: [{ id: 'a1', Account_Name: 'TF1', Website: 'tf1.fr', Modified_Time: '2026-10-01T10:00:00+02:00' }],
        info: { more_records: true, next_page_token: 'tok-2', page: 1, per_page: 200, count: 1 },
      },
    }))
    const page = await client.listAccounts('tok', API, { limit: 50 })
    expect(page).toEqual({
      companies: [{ id: 'a1', name: 'TF1', domain: 'tf1.fr', modifiedAt: '2026-10-01T08:00:00.000Z' }],
      nextAfter: 't:tok-2',
    })
    const url = String(spy.mock.calls[0]?.[0])
    expect(url).toContain('/crm/v6/Accounts?')
    expect(url).toContain('fields=Account_Name%2CWebsite%2CModified_Time')
    expect(url).toContain('sort_by=Modified_Time')
    expect(url).toContain('sort_order=asc')
    expect(url).toContain('per_page=50')
  })

  it('page_token au-delà de 2000 fiches : le curseur t:<jeton> est renvoyé tel quel, sans paramètre page', async () => {
    const spy = stubFetch(() => ({ body: { data: [], info: { more_records: false } } }))
    await client.listAccounts('tok', API, { limit: 200, after: 't:tok-2' })
    const url = String(spy.mock.calls[0]?.[0])
    expect(url).toContain('page_token=tok-2')
    expect(url).not.toMatch(/[?&]page=/)
  })

  it('sans jeton de page, le curseur est le numéro de la page suivante', async () => {
    stubFetch(() => ({ body: { data: [{ id: 'a1', Account_Name: 'X' }], info: { more_records: true, page: 3 } } }))
    expect((await client.listAccounts('tok', API, { limit: 10 })).nextAfter).toBe('p:4')
  })

  it('« depuis » part en If-Modified-Since — la synchro incrémentale ne relit que ce qui a bougé', async () => {
    const spy = stubFetch(() => ({ body: { data: [], info: { more_records: false } } }))
    await client.listContacts('tok', API, { limit: 10, since: '2026-10-01T08:00:00.000Z' })
    const init = spy.mock.calls[0]?.[1] as Init
    expect(init.headers?.['If-Modified-Since']).toBe('2026-10-01T08:00:00.000Z')
  })

  it('204 (rien à lire) est une page vide, pas une erreur', async () => {
    stubFetch(() => ({ status: 204, body: {} }))
    expect(await client.listContacts('tok', API, { limit: 10 })).toEqual({ contacts: [], nextAfter: null })
  })

  it('un contact : société = le NOM du lookup ; champ absent = null, jamais deviné', async () => {
    stubFetch(() => ({
      body: {
        data: [
          {
            id: 'c1',
            First_Name: null,
            Last_Name: 'Roy',
            Email: 'a@b.fr',
            Account_Name: { id: 'a1', name: 'TF1' },
            Modified_Time: '2026-10-02T09:00:00+00:00',
          },
        ],
        info: { more_records: false },
      },
    }))
    const page = await client.listContacts('tok', API, { limit: 10 })
    expect(page.contacts[0]).toEqual({
      id: 'c1',
      email: 'a@b.fr',
      firstName: null,
      lastName: 'Roy',
      company: 'TF1',
      jobTitle: null,
      phone: null,
      modifiedAt: '2026-10-02T09:00:00.000Z',
    })
  })

  it('une affaire garde son étape TELLE QUE Zoho la nomme ; le statut gagnée/perdue n’est pas déduit', async () => {
    stubFetch(() => ({
      body: {
        data: [
          {
            id: 'd1',
            Deal_Name: 'Régie TF1',
            Amount: 120000,
            Stage: 'Negotiation/Review',
            Closing_Date: '2026-12-01',
            Account_Name: { id: 'a1', name: 'TF1' },
            Modified_Time: '2026-10-03T09:00:00+00:00',
          },
        ],
        info: { more_records: false },
      },
    }))
    const page = await client.listDeals('tok', API, { limit: 10 })
    expect(page.deals[0]).toEqual({
      id: 'd1',
      title: 'Régie TF1',
      amount: 120000,
      currency: null,
      stage: 'Negotiation/Review',
      status: null,
      closeDate: '2026-12-01',
      accountId: 'a1',
      accountName: 'TF1',
      modifiedAt: '2026-10-03T09:00:00.000Z',
    })
  })

  it('les propriétaires (users)', async () => {
    const spy = stubFetch(() => ({
      body: { users: [{ id: 'u1', full_name: 'Léa Martin', email: 'lea@exteam.fr' }], info: { more_records: false } },
    }))
    const page = await client.listOwners('tok', API, { limit: 10 })
    expect(page.owners).toEqual([{ id: 'u1', name: 'Léa Martin', email: 'lea@exteam.fr' }])
    expect(String(spy.mock.calls[0]?.[0])).toContain('/crm/v6/users?type=ActiveUsers')
  })
})

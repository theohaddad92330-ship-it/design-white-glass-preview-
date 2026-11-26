import { classifyTransportFailure } from '../contacts/send-transport-outcome'
import { MicrosoftClient } from './microsoft.client'

const CONFIG = {
  clientId: 'cid',
  clientSecret: 'csecret',
  redirectUri: 'https://api.example.com/microsoft/callback',
  tenant: 'common',
  scopes: 'offline_access Mail.Send Calendars.ReadWrite',
  frontendUrl: 'https://app.example.com',
}

type Init = { method?: string; body?: string }
function stubFetch(handler: (url: string, method: string, init?: Init) => { status?: number; body?: unknown }) {
  return jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL, init?: Init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const { status = 200, body = {} } = handler(url, method, init)
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  }) as never) as unknown as jest.Mock
}

describe('MicrosoftClient.createEvent — #2101.27, calendrier cible', () => {
  afterEach(() => jest.restoreAllMocks())

  it('poste sur /me/events quand aucun calendrier n’est demandé — comportement historique inchangé', async () => {
    let calledUrl = ''
    stubFetch((url, method) => {
      calledUrl = url
      if (method === 'POST') return { status: 201, body: { id: 'evt-1', webLink: 'https://outlook/evt-1' } }
      throw new Error(`unexpected ${method} ${url}`)
    })
    const client = new MicrosoftClient(CONFIG)

    await client.createEvent('AT', { subject: 'Point', start: '2026-10-01T09:00:00Z', end: '2026-10-01T09:30:00Z' })

    expect(calledUrl).toBe('https://graph.microsoft.com/v1.0/me/events')
  })

  it('poste sur /me/calendars/{id}/events quand un calendrier cible est demandé', async () => {
    let calledUrl = ''
    stubFetch((url, method) => {
      calledUrl = url
      if (method === 'POST') return { status: 201, body: { id: 'evt-2', webLink: 'https://outlook/evt-2' } }
      throw new Error(`unexpected ${method} ${url}`)
    })
    const client = new MicrosoftClient(CONFIG)

    await client.createEvent('AT', {
      subject: 'Point équipe',
      start: '2026-10-01T09:00:00Z',
      end: '2026-10-01T09:30:00Z',
      calendarId: 'AAMkAGI-team',
    })

    expect(calledUrl).toBe('https://graph.microsoft.com/v1.0/me/calendars/AAMkAGI-team/events')
  })
})

describe('MicrosoftClient.deleteEvent — #2770.52', () => {
  afterEach(() => jest.restoreAllMocks())

  it('supprime via DELETE /me/events/{id}', async () => {
    let called: { url: string; method: string } | null = null
    stubFetch((url, method) => {
      called = { url, method }
      return { status: 204 }
    })
    const client = new MicrosoftClient(CONFIG)

    await client.deleteEvent('AT', 'evt-1')

    expect(called).not.toBeNull()
    expect(called!.method).toBe('DELETE')
    expect(called!.url).toBe('https://graph.microsoft.com/v1.0/me/events/evt-1')
  })

  it('traite un 404 (déjà supprimé) comme un succès', async () => {
    stubFetch(() => ({ status: 404 }))
    const client = new MicrosoftClient(CONFIG)

    await expect(client.deleteEvent('AT', 'evt-parti')).resolves.toBeUndefined()
  })

  it('rejette une vraie erreur (500)', async () => {
    stubFetch(() => ({ status: 500 }))
    const client = new MicrosoftClient(CONFIG)

    await expect(client.deleteEvent('AT', 'evt-1')).rejects.toThrow('Microsoft delete event failed')
  })
})

describe('MicrosoftClient.getRoomCapacity — #2390.9, API Places', () => {
  afterEach(() => jest.restoreAllMocks())

  it('lit `capacity` sur /places/{adresse}', async () => {
    let calledUrl = ''
    stubFetch(url => {
      calledUrl = url
      return { body: { capacity: 12 } }
    })
    const capacity = await new MicrosoftClient(CONFIG).getRoomCapacity('AT', 'salle@bellum.fr')
    expect(capacity).toBe(12)
    expect(calledUrl).toContain('https://graph.microsoft.com/v1.0/places/salle%40bellum.fr')
  })

  it('renvoie null quand Graph refuse ou ne connaît pas la salle — jamais une capacité inventée', async () => {
    stubFetch(() => ({ status: 403 }))
    expect(await new MicrosoftClient(CONFIG).getRoomCapacity('AT', 'salle@bellum.fr')).toBeNull()
  })

  it('renvoie null quand la capacité est absente ou nulle (0 = non renseigné chez Graph)', async () => {
    stubFetch(() => ({ body: { capacity: 0 } }))
    expect(await new MicrosoftClient(CONFIG).getRoomCapacity('AT', 'salle@bellum.fr')).toBeNull()
    stubFetch(() => ({ body: {} }))
    expect(await new MicrosoftClient(CONFIG).getRoomCapacity('AT', 'salle@bellum.fr')).toBeNull()
  })
})

describe('MicrosoftClient.sendMail — pièces jointes (#3699.6)', () => {
  afterEach(() => jest.restoreAllMocks())

  it('joint chaque pièce comme fileAttachment (contentBytes base64)', async () => {
    let sent: Record<string, unknown> = {}
    stubFetch((url, method, init) => {
      if (method === 'POST' && url.endsWith('/me/sendMail')) {
        sent = JSON.parse(init?.body ?? '{}') as Record<string, unknown>
        return { status: 202 }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })
    await new MicrosoftClient(CONFIG).sendMail('AT', {
      to: 'p@corp.fr',
      subject: 'Hi',
      body: 'x',
      attachments: [{ fileName: 'cv.pdf', contentType: 'application/pdf', contentBase64: 'JVBERi0=' }],
    })
    const message = sent['message'] as { attachments?: unknown[] }
    expect(message.attachments).toEqual([
      {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: 'cv.pdf',
        contentType: 'application/pdf',
        contentBytes: 'JVBERi0=',
      },
    ])
  })

  it('sans pièce, le message ne porte aucune clé attachments', async () => {
    let sent: Record<string, unknown> = {}
    stubFetch((_url, _method, init) => {
      sent = JSON.parse(init?.body ?? '{}') as Record<string, unknown>
      return { status: 202 }
    })
    await new MicrosoftClient(CONFIG).sendMail('AT', { to: 'p@corp.fr', subject: 'Hi', body: 'x' })
    expect(sent['message']).not.toHaveProperty('attachments')
  })

  it('un refus de Graph (res.ok faux) lève une erreur claire', async () => {
    stubFetch(() => ({ status: 413, body: { error: { message: 'Request too large' } } }))
    await expect(
      new MicrosoftClient(CONFIG).sendMail('AT', {
        to: 'p@corp.fr',
        subject: 'Hi',
        body: 'x',
        attachments: [{ fileName: 'cv.pdf', contentType: 'application/pdf', contentBase64: 'JVBERi0=' }],
      }),
    ).rejects.toThrow(/sendMail failed/)
  })
})

describe('MicrosoftClient.listCalendarView — pagination (#4065.7)', () => {
  afterEach(() => jest.restoreAllMocks())

  it('suit @odata.nextLink jusqu’au bout, plafonné à `top`', async () => {
    const urls: string[] = []
    stubFetch(url => {
      urls.push(url)
      return urls.length === 1
        ? {
            body: { value: [{ id: 'a' }, { id: 'b' }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next?x=1' },
          }
        : { body: { value: [{ id: 'c' }] } }
    })
    const client = new MicrosoftClient(CONFIG)
    const events = await client.listCalendarView('AT', {
      start: '2026-09-01T00:00:00Z',
      end: '2026-09-16T00:00:00Z',
      top: 250,
    })
    expect(events.map(event => event.id)).toEqual(['a', 'b', 'c'])
    expect(urls[1]).toBe('https://graph.microsoft.com/v1.0/next?x=1')
  })
})

describe('MicrosoftClient.sendMail — délai borné (#4179.1)', () => {
  afterEach(() => jest.restoreAllMocks())

  it('l’appel porte un signal d’abandon : une connexion pendue ne bloque pas la réservation', async () => {
    let signal: AbortSignal | null | undefined
    jest.spyOn(global, 'fetch' as never).mockImplementation((async (_url: string, init?: { signal?: AbortSignal }) => {
      signal = init?.signal
      return { ok: true, status: 202, json: async () => ({}) }
    }) as never)
    await new MicrosoftClient(CONFIG).sendMail('AT', { to: 'p@corp.fr', subject: 'Hi', body: 'x' })
    expect(signal).toBeInstanceOf(AbortSignal)
  })

  it('un délai dépassé reste INCERTAIN (le message est peut-être parti), jamais un échec rejouable', async () => {
    jest
      .spyOn(global, 'fetch' as never)
      .mockRejectedValue(
        Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }) as never,
      )
    const cause = await new MicrosoftClient(CONFIG)
      .sendMail('AT', { to: 'p@corp.fr', subject: 'Hi', body: 'x' })
      .catch((error: unknown) => error)
    expect(classifyTransportFailure(cause)).toBe('uncertain')
  })
})

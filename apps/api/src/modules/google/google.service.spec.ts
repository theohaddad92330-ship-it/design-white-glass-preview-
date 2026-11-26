import { ConflictException, ServiceUnavailableException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { GoogleConnectionEntity } from '../../database/entities/google-connection.entity'
import { encryptToken } from '../crm/crm-token.crypto'
import type { IaClient } from '../ia/ia.client'
import type { SuppressionService } from '../mailer/suppression.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { readGoogleConfig } from './google-config'
import { GoogleService } from './google.service'

const USER = '11111111-1111-1111-1111-111111111111'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'

function makeRepo() {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    insert: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<Repository<GoogleConnectionEntity>>
}

function makeWorkspace() {
  return {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }),
  } as unknown as jest.Mocked<WorkspaceContextService>
}

function makeIa() {
  return {
    ragIngest: jest.fn().mockResolvedValue({ ok: true, data: { id: 'rag-1' } }),
  } as unknown as jest.Mocked<IaClient>
}

function makeSuppression(suppressed = false) {
  return { isSuppressed: jest.fn().mockResolvedValue(suppressed) } as unknown as jest.Mocked<SuppressionService>
}

const CONFIGURED_ENV = {
  GOOGLE_CLIENT_ID: 'cid',
  GOOGLE_CLIENT_SECRET: 'csecret',
  GOOGLE_REDIRECT_URI: 'https://api.example.com/google/callback',
  INTERNAL_API_SECRET: 'internal-secret-with-entropy-123456',
}

type Init = { method?: string; body?: string }

/** Fake `fetch` returning a Response-ish object supporting json/text/arrayBuffer. */
function stubFetch(
  handler: (
    url: string,
    method: string,
    init?: Init,
  ) => { status?: number; json?: unknown; text?: string; bytes?: Buffer },
): jest.Mock {
  return jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL, init?: Init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const { status = 200, json = {}, text, bytes } = handler(url, method, init)
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => json,
      text: async () => text ?? '',
      arrayBuffer: async () => bytes ?? Buffer.alloc(0),
    }
  }) as never) as unknown as jest.Mock
}

describe('readGoogleConfig', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
  })

  it('is null (no-op) unless the three required vars are set', () => {
    delete process.env['GOOGLE_CLIENT_ID']
    expect(readGoogleConfig()).toBeNull()
    Object.assign(process.env, CONFIGURED_ENV)
    const cfg = readGoogleConfig()
    expect(cfg).not.toBeNull()
    // Default scopes cover the three capabilities.
    expect(cfg?.scopes).toContain('calendar.events')
    expect(cfg?.scopes).toContain('gmail.send')
    expect(cfg?.scopes).toContain('drive.readonly')
  })
})

describe('GoogleService', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  it('getStatus is a pure no-op when unconfigured (never touches DB, workspace or network)', async () => {
    delete process.env['GOOGLE_CLIENT_ID']
    const repo = makeRepo()
    const ws = makeWorkspace()
    const fetchSpy = stubFetch(() => ({ json: {} }))
    const svc = new GoogleService(repo, ws, makeIa(), makeSuppression())

    const status = await svc.getStatus(USER)
    expect(status).toEqual({ configured: false, connected: false })
    expect(ws.resolveActiveWorkspace).not.toHaveBeenCalled()
    expect(repo.findOne).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('capability-guarded methods throw (no network) when unconfigured', async () => {
    delete process.env['GOOGLE_CLIENT_ID']
    const fetchSpy = stubFetch(() => ({ json: {} }))
    const svc = new GoogleService(makeRepo(), makeWorkspace(), makeIa(), makeSuppression())

    await expect(
      svc.createCalendarEvent(USER, { summary: 'x', startDateTime: '2026-08-01T09:00:00Z' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(svc.sendGmail(USER, { to: 'a@b.com', subject: 's', body: 'b' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reports connected with granted scopes + capabilities when a connection exists', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      account_label: null,
      created_at: new Date('2026-07-10'),
      scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.send',
    })
    const svc = new GoogleService(repo, makeWorkspace(), makeIa(), makeSuppression())
    const status = await svc.getStatus(USER)
    expect(status).toMatchObject({
      configured: true,
      connected: true,
      provider: 'google',
      // Old, narrow grant: write caps on, every new read/draft/export cap OFF so the
      // UI greys them behind "reconnect to activate" — no silent regression.
      capabilities: {
        calendar: true,
        gmail: true,
        drive: false,
        calendarRead: false,
        gmailRead: false,
        gmailDraft: false,
        sheets: false,
        gmailSettings: false,
        gmailLabels: false,
      },
    })
  })

  it('derives every capability from the FULL widened scope set (whole-token match)', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      created_at: new Date('2026-07-16'),
      scope: [
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/gmail.settings.basic',
        'https://www.googleapis.com/auth/gmail.labels',
      ].join(' '),
    })
    const svc = new GoogleService(repo, makeWorkspace(), makeIa(), makeSuppression())
    const status = await svc.getStatus(USER)
    expect(status.capabilities).toEqual({
      calendar: true,
      calendarRead: true,
      gmail: true,
      gmailRead: true,
      gmailDraft: true,
      drive: true,
      sheets: true,
      gmailSettings: true,
      gmailLabels: true,
      // `gmail.modify` n'est PAS dans le jeu élargi : c'est une portée
      // RESTREINTE qui donne aussi le droit de supprimer du courrier. La
      // capacité reste éteinte tant que l'opérateur ne l'a pas ajoutée
      // délibérément et que l'utilisateur ne s'est pas reconnecté.
      gmailModify: false,
    })
  })

  it('n’allume le classement des messages QUE si `gmail.modify` a été accordée', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      created_at: new Date('2026-08-03'),
      scope: 'https://www.googleapis.com/auth/gmail.labels https://www.googleapis.com/auth/gmail.modify',
    })
    const svc = new GoogleService(repo, makeWorkspace(), makeIa(), makeSuppression())
    const status = await svc.getStatus(USER)
    expect(status.capabilities?.gmailModify).toBe(true)
    // Et l'inverse : lister des étiquettes n'a jamais suffi à en APPLIQUER une.
    expect(status.capabilities?.gmailLabels).toBe(true)
  })

  it('builds a Google authorize URL with offline access + a signed state', () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const svc = new GoogleService(makeRepo(), makeWorkspace(), makeIa(), makeSuppression())
    const url = new URL(svc.buildAuthorizeUrl(USER, 'read_write'))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('redirect_uri')).toBe(CONFIGURED_ENV.GOOGLE_REDIRECT_URI)
    const state = url.searchParams.get('state') ?? ''
    expect(state.split('.')).toHaveLength(2) // payload.signature
  })

  it('callback with a tampered state fails gracefully (no throw to browser, no network)', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const fetchSpy = stubFetch(() => ({ json: {} }))
    const svc = new GoogleService(makeRepo(), makeWorkspace(), makeIa(), makeSuppression())
    await expect(svc.handleCallback('code', 'not-a-valid-state')).resolves.toEqual({
      ok: false,
      reason: 'invalid_state',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('déconnecte SA ligne, jamais celle d’un collègue', async () => {
    // Le défaut : la suppression portait sur l'ESPACE. Dans une équipe où deux
    // personnes ont connecté leur compte, « Déconnecter » emportait la ligne de
    // quelqu'un d'autre — sans un mot, et sans que la victime puisse comprendre.
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = connectedRepo()
    const svc = new GoogleService(repo, makeWorkspace(), makeIa(), makeSuppression())
    stubFetch(() => ({ json: {} }))
    await svc.disconnect(USER)
    expect(repo.delete).toHaveBeenCalledWith({ id: 'conn-1' })
  })

  it('ne supprime rien quand ce membre n’a pas de connexion à lui', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = makeRepo()
    const svc = new GoogleService(repo, makeWorkspace(), makeIa(), makeSuppression())
    await svc.disconnect(USER)
    expect(repo.delete).not.toHaveBeenCalled()
  })

  it('RÉVOQUE le jeton chez le fournisseur avant d’effacer la ligne', async () => {
    // Effacer la ligne laissait le jeton de rafraîchissement parfaitement
    // valide côté Google, et l'application listée dans « Applications tierces »
    // du compte. « Ce qui est supprimé : les jetons » était faux.
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = connectedRepo()
    const calls: string[] = []
    stubFetch(url => {
      calls.push(url)
      return { json: {} }
    })
    await new GoogleService(repo, makeWorkspace(), makeIa(), makeSuppression()).disconnect(USER)
    expect(calls.some(url => url.startsWith('https://oauth2.googleapis.com/revoke'))).toBe(true)
    expect(repo.delete).toHaveBeenCalledWith({ id: 'conn-1' })
  })

  it('efface quand même si la révocation échoue — sinon on ne peut plus partir', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = connectedRepo()
    stubFetch(() => {
      throw new Error('Google down')
    })
    await new GoogleService(repo, makeWorkspace(), makeIa(), makeSuppression()).disconnect(USER)
    expect(repo.delete).toHaveBeenCalledWith({ id: 'conn-1' })
  })
})

describe('GoogleService — #4546 plusieurs boîtes par commercial', () => {
  const OLD = { ...process.env }
  beforeEach(() => {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
  })
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  it("listConnections rend toutes les connexions de l'utilisateur", async () => {
    const repo = makeRepo()
    ;(repo.find as jest.Mock) = jest.fn().mockResolvedValue([
      {
        id: 'conn-1',
        account_label: 'alice@work.com',
        external_account_id: 'alice@work.com',
        scope: FULL_SCOPE,
        scope_type: 'personal',
        created_at: new Date(),
      },
      {
        id: 'conn-2',
        account_label: 'alice@perso.com',
        external_account_id: 'alice@perso.com',
        scope: FULL_SCOPE,
        scope_type: 'personal',
        created_at: new Date(),
      },
    ])
    const svc = new GoogleService(repo, makeWorkspace(), makeIa(), makeSuppression())
    const conns = await svc.listConnections(USER)
    expect(conns).toHaveLength(2)
    expect(conns[0]?.accountLabel).toBe('alice@work.com')
    expect(conns[1]?.accountLabel).toBe('alice@perso.com')
  })

  it('déconnecter avec ID cible UNE connexion, pas les autres', async () => {
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockImplementation(async ({ where }: { where: { id?: string; user_id: string } }) => {
      if (where.id === 'conn-2') {
        return { id: 'conn-2', user_id: USER, provider: 'google', refresh_token_enc: null }
      }
      return null
    })
    stubFetch(() => ({ json: {} }))
    const svc = new GoogleService(repo, makeWorkspace(), makeIa(), makeSuppression())
    await svc.disconnect(USER, 'conn-2')
    expect(repo.delete).toHaveBeenCalledWith({ id: 'conn-2' })
  })

  it("listConnections rend un tableau vide quand Google n'est pas configuré", async () => {
    delete process.env['GOOGLE_CLIENT_ID']
    const repo = makeRepo()
    const svc = new GoogleService(repo, makeWorkspace(), makeIa(), makeSuppression())
    const conns = await svc.listConnections(USER)
    expect(conns).toEqual([])
  })
})

/** A repo already holding a connected Google row with a fresh token. */
function connectedRepo(scope = FULL_SCOPE) {
  const repo = makeRepo()
  const row = {
    id: 'conn-1',
    provider: 'google',
    access_token_enc: encryptToken('AT'),
    refresh_token_enc: encryptToken('RT'),
    expires_at: new Date(Date.now() + 3_600_000),
    scope,
  }
  ;(repo.findOne as jest.Mock).mockResolvedValue(row)
  ;(repo.find as jest.Mock).mockResolvedValue([row])
  return repo
}

/**
 * Un jeton qui porte tout ce que les défauts demandent — le cas nominal.
 * #2078.22 — `spreadsheets` y figure : l'export vérifie désormais la portée
 * ACCORDÉE avant d'écrire, et le défaut la demande.
 */
const FULL_SCOPE = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
].join(' ')

describe('GoogleService — Calendar', () => {
  const OLD = { ...process.env }
  beforeEach(() => {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
  })
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  it('creates an event, defaulting end to start+30min and appending the Bellum link', async () => {
    const svc = new GoogleService(connectedRepo(), makeWorkspace(), makeIa(), makeSuppression())
    let posted: Record<string, unknown> = {}
    let eventUrl = ''
    stubFetch((url, method, init) => {
      // La création lit d'abord l'adresse de la boîte : c'est ce qui permet de
      // retirer l'organisateur de ses propres invités (garde-fou n°15).
      if (url.includes('/gmail/v1/users/me/profile')) {
        return { status: 200, json: { emailAddress: 'moi@bellum.fr' } }
      }
      if (url.includes('/calendar/v3/calendars/primary/events') && method === 'POST') {
        posted = JSON.parse(init?.body ?? '{}')
        eventUrl = url
        return {
          status: 200,
          json: {
            id: 'evt-1',
            htmlLink: 'https://cal/evt-1',
            status: 'confirmed',
            hangoutLink: 'https://meet.google.com/abc-defg-hij',
          },
        }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await svc.createCalendarEvent(USER, {
      summary: 'Relance ACME',
      startDateTime: '2026-08-01T09:00:00Z',
      description: 'Relancer le DSI',
      link: 'https://app.bellum-ai.com/accounts/acme',
      attendees: ['dsi@acme.com', 'moi@bellum.fr'],
    })

    expect(result).toEqual({
      id: 'evt-1',
      htmlLink: 'https://cal/evt-1',
      status: 'confirmed',
      conferenceUrl: 'https://meet.google.com/abc-defg-hij',
    })
    expect(posted['summary']).toBe('Relance ACME')
    expect((posted['start'] as { dateTime: string }).dateTime).toBe('2026-08-01T09:00:00Z')
    expect((posted['end'] as { dateTime: string }).dateTime).toBe('2026-08-01T09:30:00.000Z')
    expect(String(posted['description'])).toContain('https://app.bellum-ai.com/accounts/acme')
    // L'organisateur n'est JAMAIS dans ses propres invités.
    expect(posted['attendees']).toEqual([{ email: 'dsi@acme.com' }])
    // Un lien Meet est demandé, et `conferenceDataVersion=1` est obligatoire —
    // sans lui Google ignore la demande en silence.
    expect(posted['conferenceData']).toBeDefined()
    expect(eventUrl).toContain('conferenceDataVersion=1')
  })

  it('RETIRE un invité qui a demandé à ne plus être contacté', async () => {
    // T-169 : une invitation d'agenda EST un message — le fournisseur l'envoie
    // lui-même à chaque invité. `attendees` était le seul chemin d'envoi du
    // produit qui ne consultait aucun verdict d'arrêt, pendant que les huit
    // chemins d'e-mail le consultaient tous.
    //
    // On retire l'invité, on ne refuse pas l'événement : faire échouer tout le
    // rendez-vous punirait les autres invités pour un refus qui n'est pas le
    // leur.
    const suppression = makeSuppression()
    ;(suppression.isSuppressed as jest.Mock).mockImplementation(
      async (_ws: string, email: string) => email === 'parti@acme.com',
    )
    const svc = new GoogleService(connectedRepo(), makeWorkspace(), makeIa(), suppression)
    let posted: Record<string, unknown> = {}
    stubFetch((url, method, init) => {
      if (url.includes('/gmail/v1/users/me/profile')) return { status: 200, json: { emailAddress: null } }
      if (url.includes('/calendar/v3/calendars/primary/events') && method === 'POST') {
        posted = JSON.parse(init?.body ?? '{}')
        return { status: 200, json: { id: 'evt-3', status: 'confirmed' } }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await svc.createCalendarEvent(USER, {
      summary: 'Point projet',
      startDateTime: '2026-08-01T09:00:00Z',
      attendees: ['dsi@acme.com', 'parti@acme.com'],
    })

    expect(posted['attendees']).toEqual([{ email: 'dsi@acme.com' }])
  })

  it('ne demande pas de visio quand l’appelant la refuse explicitement', async () => {
    const svc = new GoogleService(connectedRepo(), makeWorkspace(), makeIa(), makeSuppression())
    let posted: Record<string, unknown> = {}
    stubFetch((url, method, init) => {
      if (url.includes('/gmail/v1/users/me/profile')) return { status: 200, json: { emailAddress: null } }
      if (url.includes('/calendar/v3/calendars/primary/events') && method === 'POST') {
        posted = JSON.parse(init?.body ?? '{}')
        return { status: 200, json: { id: 'evt-2', status: 'confirmed' } }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await svc.createCalendarEvent(USER, {
      summary: 'Créneau de prospection',
      startDateTime: '2026-08-01T09:00:00Z',
      addConferencing: false,
      reminderMinutes: 60,
    })

    expect(posted['conferenceData']).toBeUndefined()
    expect(posted['reminders']).toEqual({
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 60 }],
    })
  })

  it('#2101.26 pose la RRULE fournie sur l’évènement créé — un contrat que Google honore vraiment', async () => {
    const svc = new GoogleService(connectedRepo(), makeWorkspace(), makeIa(), makeSuppression())
    let posted: Record<string, unknown> = {}
    stubFetch((url, method, init) => {
      if (url.includes('/gmail/v1/users/me/profile')) return { status: 200, json: { emailAddress: null } }
      if (url.includes('/calendar/v3/calendars/primary/events') && method === 'POST') {
        posted = JSON.parse(init?.body ?? '{}')
        return { status: 200, json: { id: 'evt-4', status: 'confirmed' } }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await svc.createCalendarEvent(USER, {
      summary: 'Comité de pilotage',
      startDateTime: '2026-08-01T09:00:00Z',
      recurrence: 'RRULE:FREQ=WEEKLY;COUNT=5',
    })

    expect(posted['recurrence']).toEqual(['RRULE:FREQ=WEEKLY;COUNT=5'])
  })

  it('#2101.26 ne pose AUCUNE récurrence quand l’appelant n’en demande pas — évènement unique inchangé', async () => {
    const svc = new GoogleService(connectedRepo(), makeWorkspace(), makeIa(), makeSuppression())
    let posted: Record<string, unknown> = {}
    stubFetch((url, method, init) => {
      if (url.includes('/gmail/v1/users/me/profile')) return { status: 200, json: { emailAddress: null } }
      if (url.includes('/calendar/v3/calendars/primary/events') && method === 'POST') {
        posted = JSON.parse(init?.body ?? '{}')
        return { status: 200, json: { id: 'evt-5', status: 'confirmed' } }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await svc.createCalendarEvent(USER, { summary: 'Point simple', startDateTime: '2026-08-01T09:00:00Z' })

    expect(posted['recurrence']).toBeUndefined()
  })

  describe('#2770.52 — annuler un évènement', () => {
    it('annule l’évènement sur l’agenda par défaut (DELETE calendars/primary/events/:id)', async () => {
      const svc = new GoogleService(connectedRepo(), makeWorkspace(), makeIa(), makeSuppression())
      let called: { url: string; method: string } | null = null
      stubFetch((url, method) => {
        called = { url, method }
        return { status: 204 }
      })

      await svc.deleteCalendarEvent(USER, 'evt-9')

      expect(called).not.toBeNull()
      expect(called!.method).toBe('DELETE')
      expect(called!.url).toContain('/calendar/v3/calendars/primary/events/evt-9')
    })

    it('traite un évènement déjà disparu (404) comme un succès — l’état voulu est déjà atteint', async () => {
      const svc = new GoogleService(connectedRepo(), makeWorkspace(), makeIa(), makeSuppression())
      stubFetch(() => ({ status: 404, text: 'Not Found' }))

      await expect(svc.deleteCalendarEvent(USER, 'evt-deja-parti')).resolves.toBeUndefined()
    })

    it('refuse sans la portée d’écriture calendrier — même garde que créer/déplacer', async () => {
      const readOnlyScope = FULL_SCOPE.split(' ')
        .filter(scope => !scope.includes('calendar.events'))
        .join(' ')
      const svc = new GoogleService(connectedRepo(readOnlyScope), makeWorkspace(), makeIa(), makeSuppression())
      stubFetch(() => {
        throw new Error('ne doit pas être appelé sans portée')
      })

      await expect(svc.deleteCalendarEvent(USER, 'evt-9')).rejects.toBeInstanceOf(ServiceUnavailableException)
    })
  })
})

describe('GoogleService — Gmail', () => {
  const OLD = { ...process.env }
  beforeEach(() => {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
  })
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  it('sends a base64url raw message via users.messages.send', async () => {
    const svc = new GoogleService(connectedRepo(), makeWorkspace(), makeIa(), makeSuppression(false))
    let raw = ''
    const fetchSpy = stubFetch((url, method, init) => {
      if (url === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send' && method === 'POST') {
        raw = (JSON.parse(init?.body ?? '{}') as { raw: string }).raw
        return { status: 200, json: { id: 'msg-1', threadId: 'thr-1' } }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await svc.sendGmail(USER, { to: 'prospect@acme.com', subject: 'Bonjour', body: 'Un message.' })
    expect(result).toEqual({ id: 'msg-1', threadId: 'thr-1' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const decoded = Buffer.from(raw, 'base64url').toString('utf8')
    expect(decoded).toContain('To: prospect@acme.com')
    expect(decoded).toContain('Subject: Bonjour')
    expect(decoded).toContain('Un message.')
  })

  it('#3699.6 — joint la pièce RÉELLE en multipart (nom accentué encodé RFC 2047)', async () => {
    const svc = new GoogleService(connectedRepo(), makeWorkspace(), makeIa(), makeSuppression(false))
    let raw = ''
    stubFetch((url, method, init) => {
      if (url === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send' && method === 'POST') {
        raw = (JSON.parse(init?.body ?? '{}') as { raw: string }).raw
        return { status: 200, json: { id: 'msg-2', threadId: null } }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await svc.sendGmail(USER, {
      to: 'prospect@acme.com',
      subject: 'Bonjour',
      body: 'Un message.',
      attachments: [{ fileName: 'présentation.pdf', contentType: 'application/pdf', contentBase64: 'JVBERi0=' }],
    })
    const decoded = Buffer.from(raw, 'base64url').toString('utf8')
    expect(decoded).toContain('multipart/mixed')
    expect(decoded).toContain('Content-Type: application/pdf')
    expect(decoded).toContain('JVBERi0=')
    expect(decoded).toContain(`filename="=?UTF-8?B?${Buffer.from('présentation.pdf').toString('base64')}?="`)
  })

  it('refuses to send to a suppressed (opted-out) recipient — no network call', async () => {
    const svc = new GoogleService(connectedRepo(), makeWorkspace(), makeIa(), makeSuppression(true))
    const fetchSpy = stubFetch(() => ({ json: {} }))
    await expect(svc.sendGmail(USER, { to: 'optout@acme.com', subject: 's', body: 'b' })).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('GoogleService — Drive → RAG', () => {
  const OLD = { ...process.env }
  beforeEach(() => {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
  })
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  it('refuse la recherche documentaire quand la portée manque — jamais un 500, jamais une liste vide', async () => {
    // Le trou de la recette du 16/08 : ce correctif avait été posé sur le CRM et
    // sur l'espace documentaire Microsoft, et jamais sur Drive. Sans la portée,
    // Google rendait un 403, que le client transformait en `Error` nue et le
    // filtre global en 500 « Internal server error ».
    const svc = new GoogleService(
      connectedRepo('https://www.googleapis.com/auth/gmail.send'),
      makeWorkspace(),
      makeIa(),
      makeSuppression(),
    )
    const fetchSpy = stubFetch(() => ({ json: {} }))

    await expect(svc.searchDriveContent(USER, { query: 'Tech Lead Java' })).rejects.toMatchObject({
      response: {
        statusCode: 503,
        code: 'scope_missing',
        // La portée NOMMÉE : c'est ce qui dit à l'opérateur quoi déclarer.
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      },
    })
    // Et surtout : aucun appel réseau. On ne va pas demander à Google une chose
    // dont on sait déjà qu'on n'a pas le droit de la demander.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('traduit une API éteinte côté fournisseur en refus lisible, pas en erreur interne', async () => {
    const svc = new GoogleService(connectedRepo(), makeWorkspace(), makeIa(), makeSuppression())
    stubFetch(() => {
      throw new Error(
        'Google Drive list files failed: Google Drive API has not been used in project 240781671020 before or it is disabled.',
      )
    })
    await expect(svc.listDriveFiles(USER, {})).rejects.toMatchObject({
      response: { statusCode: 503, code: 'provider_api_disabled' },
    })
  })

  it('lists Google Docs + PDFs, filtering out trashed files', async () => {
    const svc = new GoogleService(connectedRepo(), makeWorkspace(), makeIa(), makeSuppression())
    let listedUrl = ''
    stubFetch((url, method) => {
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?') && method === 'GET') {
        listedUrl = url
        return { json: { files: [{ id: 'f1', name: 'Compte rendu', mimeType: 'application/pdf' }] } }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const page = await svc.listDriveFiles(USER, {})
    expect(page.files).toHaveLength(1)
    const q = new URL(listedUrl).searchParams.get('q') ?? ''
    expect(q).toContain("mimeType='application/vnd.google-apps.document'")
    expect(q).toContain("mimeType='application/pdf'")
    expect(q).toContain('trashed=false')
  })

  it('ingests a Google Doc by exporting text into the existing RAG pipeline', async () => {
    const ia = makeIa()
    const svc = new GoogleService(connectedRepo(), makeWorkspace(), ia, makeSuppression())
    stubFetch((url, method) => {
      if (url.includes('/drive/v3/files/doc-1?fields=') && method === 'GET') {
        return { json: { id: 'doc-1', name: 'Notes ACME', mimeType: 'application/vnd.google-apps.document' } }
      }
      if (url.includes('/drive/v3/files/doc-1/export?') && method === 'GET') {
        return { text: 'Contenu du document.' }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await svc.ingestDriveFile(USER, 'doc-1')
    expect(ia.ragIngest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        title: 'Notes ACME',
        content: 'Contenu du document.',
        category: 'google-drive',
      }),
    )
  })

  it('ingests a PDF by downloading bytes and handing them off as base64 (server-side extraction)', async () => {
    const ia = makeIa()
    const svc = new GoogleService(connectedRepo(), makeWorkspace(), ia, makeSuppression())
    const pdfBytes = Buffer.from('%PDF-1.4 fake', 'utf8')
    stubFetch((url, method) => {
      if (url.includes('/drive/v3/files/pdf-1?fields=') && method === 'GET') {
        return { json: { id: 'pdf-1', name: 'Rapport', mimeType: 'application/pdf' } }
      }
      if (url.includes('/drive/v3/files/pdf-1?alt=media') && method === 'GET') {
        return { bytes: pdfBytes }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await svc.ingestDriveFile(USER, 'pdf-1')
    expect(ia.ragIngest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        title: 'Rapport',
        fileB64: pdfBytes.toString('base64'),
        filename: 'Rapport.pdf',
        category: 'google-drive',
      }),
    )
  })

  it('rejects an unsupported Drive file type (never calls RAG)', async () => {
    const ia = makeIa()
    const svc = new GoogleService(connectedRepo(), makeWorkspace(), ia, makeSuppression())
    stubFetch((url, method) => {
      if (url.includes('/drive/v3/files/sheet-1?fields=') && method === 'GET') {
        return { json: { id: 'sheet-1', name: 'Budget', mimeType: 'application/vnd.google-apps.spreadsheet' } }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await expect(svc.ingestDriveFile(USER, 'sheet-1')).rejects.toThrow(/non supporté/)
    expect(ia.ragIngest).not.toHaveBeenCalled()
  })
})

describe('GoogleService — Gmail READ (contact exchanges)', () => {
  const OLD = { ...process.env }
  beforeEach(() => {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
  })
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  const iso = (d: string) => String(Date.parse(d))
  const metaFor: Record<string, unknown> = {
    m1: {
      id: 'm1',
      threadId: 't1',
      snippet: 'older',
      internalDate: iso('2026-07-01T00:00:00Z'),
      payload: {
        headers: [
          { name: 'Subject', value: 'Sujet 1' },
          { name: 'From', value: 'prospect@acme.com' },
        ],
      },
    },
    m2: {
      id: 'm2',
      threadId: 't1',
      snippet: 'newer',
      internalDate: iso('2026-07-05T00:00:00Z'),
      payload: { headers: [{ name: 'Subject', value: 'Sujet 2' }] },
    },
    m3: {
      id: 'm3',
      threadId: 't2',
      snippet: 'other thread',
      internalDate: iso('2026-07-03T00:00:00Z'),
      payload: { headers: [{ name: 'Subject', value: 'Sujet 3' }] },
    },
  }

  it('dedupes to the newest message per thread, newest first, metadata only', async () => {
    const svc = new GoogleService(connectedRepo(), makeWorkspace(), makeIa(), makeSuppression())
    let listUrl = ''
    let usedMetadataFormat = true
    stubFetch((url, method) => {
      if (/\/gmail\/v1\/users\/me\/messages\?/.test(url) && method === 'GET') {
        listUrl = url
        return {
          json: {
            messages: [
              { id: 'm1', threadId: 't1' },
              { id: 'm2', threadId: 't1' },
              { id: 'm3', threadId: 't2' },
            ],
          },
        }
      }
      const hit = url.match(/\/messages\/(m\d)\?/)
      if (hit && method === 'GET') {
        if (!url.includes('format=metadata')) usedMetadataFormat = false
        return { json: metaFor[hit[1]] }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await svc.listGmailWithContact(USER, { email: 'prospect@acme.com' })
    expect(usedMetadataFormat).toBe(true) // never requests the full body
    expect(new URL(listUrl).searchParams.get('q')).toContain('prospect@acme.com')
    expect(result).toHaveLength(2) // t1 collapsed to one, t2 one
    expect(result[0]?.id).toBe('m2') // newest overall
    expect(result[0]?.subject).toBe('Sujet 2')
    expect(result[1]?.id).toBe('m3')
  })

  it('returns [] (no metadata fetches) when the mailbox has no matching messages', async () => {
    const svc = new GoogleService(connectedRepo(), makeWorkspace(), makeIa(), makeSuppression())
    const fetchSpy = stubFetch((url, method) => {
      if (/\/gmail\/v1\/users\/me\/messages\?/.test(url) && method === 'GET') return { json: { messages: [] } }
      throw new Error(`unexpected ${method} ${url}`)
    })
    await expect(svc.listGmailWithContact(USER, { email: 'nobody@acme.com' })).resolves.toEqual([])
    expect(fetchSpy).toHaveBeenCalledTimes(1) // list only, no per-message get
  })
})

describe('GoogleService — Gmail DRAFT', () => {
  const OLD = { ...process.env }
  beforeEach(() => {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
  })
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  it('creates a draft (never sends) with the encoded message', async () => {
    const svc = new GoogleService(connectedRepo(), makeWorkspace(), makeIa(), makeSuppression(false))
    let raw = ''
    stubFetch((url, method, init) => {
      if (url === 'https://gmail.googleapis.com/gmail/v1/users/me/drafts' && method === 'POST') {
        raw = (JSON.parse(init?.body ?? '{}') as { message: { raw: string } }).message.raw
        return { json: { id: 'draft-1', message: { id: 'm9', threadId: 't9' } } }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })
    const result = await svc.createGmailDraft(USER, { to: 'prospect@acme.com', subject: 'Idea', body: 'Bonjour.' })
    expect(result).toEqual({ id: 'draft-1', messageId: 'm9', threadId: 't9' })
    const decoded = Buffer.from(raw, 'base64url').toString('utf8')
    expect(decoded).toContain('To: prospect@acme.com')
    expect(decoded).toContain('Subject: Idea')
    expect(decoded).toContain('Bonjour.')
  })

  it('refuses to draft to a suppressed (opted-out) recipient — no network call', async () => {
    const svc = new GoogleService(connectedRepo(), makeWorkspace(), makeIa(), makeSuppression(true))
    const fetchSpy = stubFetch(() => ({ json: {} }))
    await expect(svc.createGmailDraft(USER, { to: 'optout@acme.com', subject: 's', body: 'b' })).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('GoogleService — Calendar READ (meeting-prep brief)', () => {
  const OLD = { ...process.env }
  beforeEach(() => {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
  })
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  it('lists upcoming events, deriving the registrable domain from a URL query', async () => {
    const svc = new GoogleService(connectedRepo(), makeWorkspace(), makeIa(), makeSuppression())
    let eventsUrl = ''
    stubFetch((url, method) => {
      if (url.includes('/calendar/v3/calendars/primary/events?') && method === 'GET') {
        eventsUrl = url
        return {
          json: {
            items: [
              {
                id: 'e1',
                summary: 'RDV ACME',
                start: { dateTime: '2026-08-01T09:00:00Z' },
                end: { dateTime: '2026-08-01T10:00:00Z' },
                attendees: [{ email: 'dsi@acme.com', displayName: 'DSI', responseStatus: 'accepted' }],
                htmlLink: 'https://cal/e1',
              },
            ],
          },
        }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const events = await svc.listUpcomingEvents(USER, { query: 'https://www.acme.com/about' })
    const params = new URL(eventsUrl).searchParams
    expect(params.get('q')).toBe('acme.com')
    expect(params.get('singleEvents')).toBe('true')
    expect(params.get('orderBy')).toBe('startTime')
    expect(params.get('timeMin')).toBeTruthy()
    expect(events[0]?.attendees[0]?.email).toBe('dsi@acme.com')
  })
})

describe('GoogleService — Sheets export', () => {
  const OLD = { ...process.env }
  beforeEach(() => {
    Object.assign(process.env, CONFIGURED_ENV)
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
  })
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  it('creates a spreadsheet with the header row followed by data rows', async () => {
    const svc = new GoogleService(connectedRepo(), makeWorkspace(), makeIa(), makeSuppression())
    let posted: Record<string, unknown> = {}
    stubFetch((url, method, init) => {
      if (url === 'https://sheets.googleapis.com/v4/spreadsheets' && method === 'POST') {
        posted = JSON.parse(init?.body ?? '{}')
        return { json: { spreadsheetId: 'sh1', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sh1' } }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await svc.exportSheet(USER, {
      title: 'Contacts ACME',
      columns: ['Nom', 'Email'],
      rows: [['Jean Dupont', 'jean@acme.com']],
    })
    expect(result).toEqual({ spreadsheetId: 'sh1', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sh1' })
    expect((posted['properties'] as { title: string }).title).toBe('Contacts ACME')
    const rowData = (
      posted['sheets'] as Array<{
        data: Array<{ rowData: Array<{ values: Array<{ userEnteredValue: { stringValue: string } }> }> }>
      }>
    )[0]?.data[0]?.rowData
    expect(rowData?.[0]?.values[0]?.userEnteredValue.stringValue).toBe('Nom') // header row
    expect(rowData?.[1]?.values[1]?.userEnteredValue.stringValue).toBe('jean@acme.com') // data row
  })
})

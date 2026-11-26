import { type HttpException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { GoogleConnectionEntity } from '../../database/entities/google-connection.entity'
import { encryptToken } from '../crm/crm-token.crypto'
import type { IaClient } from '../ia/ia.client'
import type { SuppressionService } from '../mailer/suppression.service'
import { GoogleMailBackend } from '../mailbox/google-mail.backend'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { googleAuthorizeQuerySchema } from './dto/google.dto'
import { googleScopesForLevel, readGoogleConfig } from './google-config'
import { GoogleService } from './google.service'

/**
 * #2078.22 / #2078.23 — la matrice d'autorisation Google.
 *
 * Deux niveaux nommés (lecture ; lecture + écriture), chacun sa liste de
 * portées. Chaque geste qui ÉCRIT vérifie les portées que Google a RENDUES —
 * jamais celles demandées — et refuse, sans appel réseau d'écriture, quand la
 * connexion est en lecture seule.
 */

const USER = '11111111-1111-1111-1111-111111111111'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'

const S = (name: string) => `https://www.googleapis.com/auth/${name}`

const READ_ONLY_GRANT = [S('gmail.readonly'), S('calendar.readonly'), S('drive.readonly')].join(' ')
const WRITE_SCOPES = [
  S('calendar.events'),
  S('gmail.send'),
  S('gmail.compose'),
  S('spreadsheets'),
  S('gmail.settings.basic'),
  S('gmail.labels'),
]
const FULL_GRANT = [READ_ONLY_GRANT, ...WRITE_SCOPES].join(' ')

const CONFIGURED_ENV = {
  GOOGLE_CLIENT_ID: 'cid',
  GOOGLE_CLIENT_SECRET: 'csecret',
  GOOGLE_REDIRECT_URI: 'https://api.example.com/google/callback',
  INTERNAL_API_SECRET: 'internal-secret-with-entropy-123456',
  CRM_TOKEN_ENC_KEY: 'enc-key-with-enough-entropy-123456789',
}

function repoWith(row: Record<string, unknown> | null) {
  return {
    findOne: jest.fn().mockResolvedValue(row),
    insert: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<Repository<GoogleConnectionEntity>>
}

function connection(scope: string | null) {
  return {
    id: 'conn-1',
    provider: 'google',
    account_label: 'moi@bellum.fr',
    created_at: new Date('2026-09-01'),
    access_token_enc: encryptToken('AT'),
    refresh_token_enc: encryptToken('RT'),
    expires_at: new Date(Date.now() + 3_600_000),
    scope,
  }
}

function service(repo: jest.Mocked<Repository<GoogleConnectionEntity>>) {
  const workspace = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }),
  } as unknown as jest.Mocked<WorkspaceContextService>
  const ia = { ragIngest: jest.fn() } as unknown as jest.Mocked<IaClient>
  const suppression = { isSuppressed: jest.fn().mockResolvedValue(false) } as unknown as jest.Mocked<SuppressionService>
  return new GoogleService(repo, workspace, ia, suppression)
}

type Call = { url: string; method: string }

/** Enregistre chaque appel réseau ; rend une réponse neutre. */
function recordFetch(respond: (call: Call) => unknown = () => ({})): Call[] {
  const calls: Call[] = []
  jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL, init?: { method?: string }) => {
    const call = { url: String(input), method: init?.method ?? 'GET' }
    calls.push(call)
    return {
      ok: true,
      status: 200,
      json: async () => respond(call),
      text: async () => '',
      arrayBuffer: async () => Buffer.alloc(0),
    }
  }) as never)
  return calls
}

const writes = (calls: Call[]) => calls.filter(call => call.method !== 'GET')

async function rejection(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await promise
  } catch (error) {
    return (error as HttpException).getResponse() as Record<string, unknown>
  }
  throw new Error('attendu : un refus, obtenu : une réussite')
}

const OLD = { ...process.env }
beforeEach(() => {
  process.env = { ...OLD, ...CONFIGURED_ENV }
  delete process.env['GOOGLE_SCOPES']
})
afterEach(() => {
  process.env = { ...OLD }
  jest.restoreAllMocks()
})

describe('#2078.22 — deux niveaux, chacun sa liste de portées', () => {
  it('le niveau LECTURE ne demande aucune portée d’écriture', () => {
    const config = readGoogleConfig()
    if (!config) throw new Error('config attendue')
    const read = googleScopesForLevel(config, 'read').split(' ')
    expect(read.sort()).toEqual(READ_ONLY_GRANT.split(' ').sort())
    for (const scope of WRITE_SCOPES) expect(read).not.toContain(scope)
  })

  it('le niveau LECTURE + ÉCRITURE demande la lecture ET l’écriture — c’est le défaut historique', () => {
    const config = readGoogleConfig()
    if (!config) throw new Error('config attendue')
    const full = googleScopesForLevel(config, 'read_write').split(' ')
    expect(full.sort()).toEqual(FULL_GRANT.split(' ').sort())
    expect(googleScopesForLevel(config, 'read_write')).toBe(config.scopes)
  })

  it('une liste d’opérateur (`GOOGLE_SCOPES`) ne fait jamais entrer une écriture dans le niveau lecture', () => {
    process.env['GOOGLE_SCOPES'] = [S('gmail.readonly'), S('gmail.send'), S('gmail.modify')].join(' ')
    const config = readGoogleConfig()
    if (!config) throw new Error('config attendue')
    expect(googleScopesForLevel(config, 'read')).toBe(S('gmail.readonly'))
    // Et le niveau complet garde la liste de l'opérateur telle quelle.
    expect(googleScopesForLevel(config, 'read_write')).toBe(process.env['GOOGLE_SCOPES'])
  })

  it('refuse de construire un niveau lecture VIDE plutôt que d’envoyer une demande sans portée', () => {
    process.env['GOOGLE_SCOPES'] = S('gmail.send')
    const config = readGoogleConfig()
    if (!config) throw new Error('config attendue')
    expect(() => googleScopesForLevel(config, 'read')).toThrow()
  })
})

describe('#2078.23 — la route de consentement exige un niveau NOMMÉ', () => {
  it('refuse une demande sans niveau, ou avec un niveau inventé', () => {
    expect(googleAuthorizeQuerySchema.safeParse({}).success).toBe(false)
    expect(googleAuthorizeQuerySchema.safeParse({ level: 'admin' }).success).toBe(false)
    expect(googleAuthorizeQuerySchema.safeParse({ level: 'read', scope: 'x' }).success).toBe(false)
  })

  it('TÉMOIN — accepte les deux niveaux', () => {
    expect(googleAuthorizeQuerySchema.safeParse({ level: 'read' }).success).toBe(true)
    expect(googleAuthorizeQuerySchema.safeParse({ level: 'read_write' }).success).toBe(true)
  })
})

describe('#2078.23 — commencer en lecture seule, élever plus tard', () => {
  it('la demande LECTURE ne réclame pas les accès déjà accordés (aucune élévation implicite)', () => {
    const url = new URL(service(repoWith(null)).buildAuthorizeUrl(USER, 'read'))
    expect(url.searchParams.get('scope')?.split(' ').sort()).toEqual(READ_ONLY_GRANT.split(' ').sort())
    // Sans ce paramètre, le jeton rendu ne couvre QUE les portées demandées,
    // même si une ancienne concession d'écriture traîne chez le fournisseur.
    expect(url.searchParams.has('include_granted_scopes')).toBe(false)
    expect(url.searchParams.get('access_type')).toBe('offline')
  })

  it('la demande d’ÉLÉVATION est incrémentale : elle garde ce qui est déjà accordé', () => {
    const url = new URL(service(repoWith(null)).buildAuthorizeUrl(USER, 'read_write'))
    expect(url.searchParams.get('include_granted_scopes')).toBe('true')
    for (const scope of WRITE_SCOPES) expect(url.searchParams.get('scope')).toContain(scope)
  })

  it('le `state` ne change pas de forme et ne porte pas le niveau', () => {
    const svc = service(repoWith(null))
    for (const level of ['read', 'read_write'] as const) {
      const state = new URL(svc.buildAuthorizeUrl(USER, level)).searchParams.get('state') ?? ''
      const [payload, sig] = state.split('.')
      expect(sig).toBeTruthy()
      const decoded = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as Record<string, unknown>
      expect(Object.keys(decoded).sort()).toEqual(['n', 't', 'u'])
    }
  })

  it('le niveau AFFICHÉ se dérive des portées accordées', async () => {
    expect((await service(repoWith(connection(READ_ONLY_GRANT))).getStatus(USER)).accessLevel).toBe('read')
    expect((await service(repoWith(connection(FULL_GRANT))).getStatus(USER)).accessLevel).toBe('read_write')
    // Une connexion dont on ignore les portées n'est pas « en lecture » : on ne sait pas.
    expect((await service(repoWith(connection(null))).getStatus(USER)).accessLevel).toBeNull()
  })

  it('l’élévation met à jour LA connexion existante, sans perdre le jeton de rafraîchissement', async () => {
    const existing = connection(READ_ONLY_GRANT)
    const repo = repoWith(existing)
    const svc = service(repo)
    const state = new URL(svc.buildAuthorizeUrl(USER, 'read_write')).searchParams.get('state') ?? ''
    recordFetch(() => ({ access_token: 'AT2', expires_in: 3600, scope: FULL_GRANT }))

    await expect(svc.handleCallback('code', state)).resolves.toEqual({ ok: true })

    expect(repo.insert).not.toHaveBeenCalled()
    expect((repo.update as jest.Mock).mock.calls[0]?.[0]).toEqual({ id: 'conn-1' })
    const patch = (repo.update as jest.Mock).mock.calls[0]?.[1] as Record<string, unknown>
    expect(patch['scope']).toBe(FULL_GRANT)
    // Google n'a pas renvoyé de nouveau jeton de rafraîchissement : l'ancien reste.
    expect(patch['refresh_token_enc']).toBe(existing.refresh_token_enc)
  })

  it('stocke les portées RENDUES par le fournisseur, jamais celles demandées', async () => {
    const repo = repoWith(null)
    const svc = service(repo)
    const state = new URL(svc.buildAuthorizeUrl(USER, 'read_write')).searchParams.get('state') ?? ''
    // L'utilisateur a décoché l'envoi sur l'écran de consentement.
    const granted = [READ_ONLY_GRANT, S('gmail.compose')].join(' ')
    recordFetch(() => ({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600, scope: granted }))
    await svc.handleCallback('code', state)
    expect(((repo.insert as jest.Mock).mock.calls[0]?.[0] as Record<string, unknown>)['scope']).toBe(granted)
  })

  it('un fournisseur muet sur les portées ne se voit prêter AUCUNE portée', async () => {
    const repo = repoWith(null)
    const svc = service(repo)
    const state = new URL(svc.buildAuthorizeUrl(USER, 'read_write')).searchParams.get('state') ?? ''
    recordFetch(() => ({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }))
    await svc.handleCallback('code', state)
    expect(((repo.insert as jest.Mock).mock.calls[0]?.[0] as Record<string, unknown>)['scope']).toBeNull()
  })

  // #2078.22.c — revue sécurité du lot K : une portée NON configurée par
  // l'opérateur (`GOOGLE_SCOPES` ne la liste pas) ne doit jamais s'enregistrer,
  // même si Google la rend — ex. `gmail.modify` obtenue en modifiant l'URL de
  // consentement (`scope=…&gmail.modify`) avant de suivre le lien.
  it('une portée RENDUE mais jamais CONFIGURÉE par l’opérateur n’est jamais stockée', async () => {
    const repo = repoWith(null)
    const svc = service(repo)
    const state = new URL(svc.buildAuthorizeUrl(USER, 'read_write')).searchParams.get('state') ?? ''
    const granted = [FULL_GRANT, S('gmail.modify')].join(' ')
    recordFetch(() => ({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600, scope: granted }))
    await svc.handleCallback('code', state)
    const stored = String(((repo.insert as jest.Mock).mock.calls[0]?.[0] as Record<string, unknown>)['scope'])
    expect(stored.split(' ')).not.toContain(S('gmail.modify'))
    expect(stored.split(' ').sort()).toEqual(FULL_GRANT.split(' ').sort())
  })
})

describe('#2078.22 — une écriture vérifie le niveau ACCORDÉ, et le dit quand il manque', () => {
  const draft = { to: 'dsi@acme.com', subject: 'Bonjour', body: 'Un message.' }

  const cases: Array<{ name: string; scope: string; run: (svc: GoogleService) => Promise<unknown> }> = [
    { name: 'brouillon', scope: S('gmail.compose'), run: svc => svc.createGmailDraft(USER, draft) },
    { name: 'envoi', scope: S('gmail.send'), run: svc => svc.sendGmail(USER, draft) },
    {
      name: 'évènement',
      scope: S('calendar.events'),
      run: svc => svc.createCalendarEvent(USER, { summary: 'Point', startDateTime: '2026-10-01T09:00:00Z' }),
    },
    {
      name: 'déplacement',
      scope: S('calendar.events'),
      run: svc =>
        svc.rescheduleCalendarEvent(USER, {
          eventId: 'evt-1',
          startsAt: '2026-10-01T10:00:00Z',
          endsAt: '2026-10-01T10:30:00Z',
          notifyGuests: false,
        }),
    },
    {
      name: 'feuille de calcul',
      scope: S('spreadsheets'),
      run: svc => svc.exportSheet(USER, { title: 'Export', columns: ['Nom'], rows: [['A']] }),
    },
    {
      name: 'classement',
      scope: S('gmail.modify'),
      run: svc => svc.classifyMessage(USER, { messageId: 'm-1', labelName: 'Prospect' }),
    },
  ]

  it.each(cases)('$name : refusé en lecture seule, sans aucune écriture tentée', async ({ scope, run }) => {
    const calls = recordFetch()
    const body = await rejection(run(service(repoWith(connection(READ_ONLY_GRANT)))))
    expect(body['code']).toBe('scope_missing')
    expect(body['scopes']).toEqual([scope])
    expect(writes(calls)).toEqual([])
  })

  it('le refus propose l’élévation, sans nommer l’éditeur', async () => {
    recordFetch()
    const body = await rejection(service(repoWith(connection(READ_ONLY_GRANT))).createGmailDraft(USER, draft))
    const message = String(body['message'])
    expect(message).toMatch(/Intégrations/)
    expect(message).toMatch(/écriture/)
    expect(message).not.toMatch(/google|gmail/i)
  })

  it('sans connexion, le refus dit « pas connecté », pas « lecture seule »', async () => {
    recordFetch()
    const body = await rejection(service(repoWith(null)).createGmailDraft(USER, draft))
    expect(body['code']).toBe('not_connected')
  })

  // #2078.22.b — revue sécurité du lot K : une connexion EXISTANTE dont le
  // niveau est INCONNU (portée vide, ou non reconnue) n'est pas « lecture
  // seule » — on ignore ce qui a été réellement accordé. Le refus « lecture
  // seule » menait à une impasse : la carte Intégrations ne proposait
  // « Autoriser l'écriture » que sur un niveau `read`, jamais sur `null`.
  it('niveau INCONNU : le refus ne dit pas « lecture seule », il dit que l’écriture n’est pas confirmée', async () => {
    recordFetch()
    const body = await rejection(service(repoWith(connection(null))).createGmailDraft(USER, draft))
    expect(body['code']).toBe('scope_missing')
    const message = String(body['message'])
    expect(message).not.toMatch(/lecture seule/)
    expect(message).toMatch(/pas confirmé/)
    expect(message).toMatch(/Intégrations/)
    expect(message).not.toMatch(/google|gmail/i)
  })

  it('TÉMOIN — en lecture + écriture, le brouillon part bien', async () => {
    const calls = recordFetch(() => ({ id: 'd-1', message: { id: 'm-1', threadId: 't-1' } }))
    await service(repoWith(connection(FULL_GRANT))).createGmailDraft(USER, draft)
    expect(writes(calls).map(call => call.url)).toEqual(['https://gmail.googleapis.com/gmail/v1/users/me/drafts'])
  })

  it('TÉMOIN — une portée d’écriture accordée seule suffit à SA capacité, pas aux autres', async () => {
    const grant = [READ_ONLY_GRANT, S('gmail.compose')].join(' ')
    const calls = recordFetch(() => ({ id: 'd-1', message: { id: 'm-1', threadId: 't-1' } }))
    await service(repoWith(connection(grant))).createGmailDraft(USER, draft)
    expect(writes(calls)).toHaveLength(1)
    const body = await rejection(service(repoWith(connection(grant))).sendGmail(USER, draft))
    expect(body['scopes']).toEqual([S('gmail.send')])
  })
})

describe('#2078.22 — la messagerie (brouillon dans un fil, réponse d’absence) passe par le même contrôle', () => {
  const request = {
    to: 'dsi@acme.com',
    cc: [],
    subject: 'Bonjour',
    body: 'Un message.',
    appendSignature: false,
    documentIds: [],
  }

  it('brouillon refusé en lecture seule, sans écriture tentée', async () => {
    const calls = recordFetch()
    const backend = new GoogleMailBackend(service(repoWith(connection(READ_ONLY_GRANT))))
    const body = await rejection(backend.createDraft(USER, request as never, null))
    expect(body['code']).toBe('scope_missing')
    expect(writes(calls)).toEqual([])
  })

  it('réponse d’absence refusée en lecture seule, sans écriture tentée', async () => {
    const calls = recordFetch()
    const backend = new GoogleMailBackend(service(repoWith(connection(READ_ONLY_GRANT))))
    const body = await rejection(backend.setOutOfOffice(USER, { enabled: true, contactsOnly: false }))
    expect(body['scopes']).toEqual([S('gmail.settings.basic')])
    expect(writes(calls)).toEqual([])
  })

  it('TÉMOIN — en lecture + écriture, le brouillon dans un fil part bien', async () => {
    const calls = recordFetch(() => ({ id: 'd-1', message: { id: 'm-1', threadId: 't-1' } }))
    const backend = new GoogleMailBackend(service(repoWith(connection(FULL_GRANT))))
    await backend.createDraft(USER, request as never, null)
    expect(writes(calls)).toHaveLength(1)
  })

  it('TÉMOIN — la LECTURE reste permise en lecture seule', async () => {
    const calls = recordFetch(() => ({ plain: 'x' }))
    const backend = new GoogleMailBackend(service(repoWith(connection(READ_ONLY_GRANT))))
    await backend.fetchBody(USER, 'm-1')
    expect(calls.length).toBeGreaterThan(0)
    expect(writes(calls)).toEqual([])
  })
})

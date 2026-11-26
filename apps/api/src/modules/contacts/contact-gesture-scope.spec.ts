import { NotFoundException } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LemlistService } from '../lemlist/lemlist.service'
import { LinkedInService } from '../linkedin/linkedin.service'
import { CrmService } from '../crm/crm.service'
import { contactGestureWhere } from './contact-gesture-scope'
import { ContactEnrichmentService } from './contact-enrichment.service'

/**
 * #4803 — la clé de geste d'un contact est l'ESPACE, pour les SEPT gestes hors `contacts.service.ts`.
 * Chaque test fabrique SON dépôt (une instance par appel) : un double partagé rendrait un
 * `not.toHaveBeenCalledWith` trop large. Le dépôt évalue réellement le `where` sur des lignes.
 */

const ME = 'u-me'
const WS = 'ws-1'
const OTHER_WS = 'ws-2'

type Row = Record<string, unknown>
type Op = { _type?: string; _value?: unknown }

const row = (over: Row): Row => ({ deleted_at: null, full_name: 'Ada', email: 'ada@acme.fr', ...over })
const ROWS: Record<string, Row> = {
  // collecté par un COLLÈGUE, dans mon espace
  team: row({ id: 'c-team', workspace_id: WS, user_id: 'u-colleague' }),
  // d'un AUTRE espace
  foreign: row({ id: 'c-foreign', workspace_id: OTHER_WS, user_id: 'u-stranger' }),
  // ANCIENNE ligne : à moi / à un tiers
  legacyMine: row({ id: 'c-legacy-mine', workspace_id: null, user_id: ME }),
  legacyOther: row({ id: 'c-legacy-other', workspace_id: null, user_id: 'u-third' }),
}

function matches(r: Row, clause: Row): boolean {
  return Object.entries(clause).every(([key, want]) => {
    const op = want as Op
    if (op && typeof op === 'object' && op._type === 'isNull') return r[key] === null || r[key] === undefined
    if (op && typeof op === 'object' && op._type === 'in') return (op._value as unknown[]).includes(r[key])
    return r[key] === want
  })
}

/** Un dépôt NEUF par appel, qui évalue le `where` (objet ou tableau = OU) sur `rows`. */
function repo(rows: Row[]) {
  const select = (where: Row | Row[] | undefined) =>
    rows.filter(r => (where === undefined ? true : (Array.isArray(where) ? where : [where]).some(c => matches(r, c))))
  return {
    findOne: jest.fn(async ({ where }: { where?: Row | Row[] }) => select(where)[0] ?? null),
    find: jest.fn(async ({ where }: { where?: Row | Row[] }) => select(where)),
  }
}

const workspaceContext = () => ({
  resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WS })),
  isDemoWorkspace: jest.fn(async () => false),
})

type Gesture = { name: string; run: (contactId: string) => Promise<boolean> }

const allContacts = () => Object.values(ROWS)

function enrichmentGesture(): Gesture {
  return {
    name: 'contact-enrichment.service — vérifier en masse',
    run: async id => {
      const svc = new ContactEnrichmentService(
        { getJob: jest.fn(async () => null), add: jest.fn(async () => ({ id: 'j' })) } as never,
        repo(allContacts()) as never,
        { preflightEnrichment: jest.fn(async () => ({ type: 'success', output: { id } })) } as never,
        workspaceContext() as never,
      )
      const [out] = await svc.enqueueBulk([id], ME)
      return !(out && !out.ok && out.code === 'not_found')
    },
  }
}

function crmGesture(): Gesture {
  return {
    name: 'crm.service — adoptCrmValue',
    run: async id => {
      const contacts = { ...repo(allContacts()), update: jest.fn() }
      const svc = new CrmService(
        {} as never,
        {} as never,
        workspaceContext() as never,
        {} as never,
        undefined,
        contacts as never,
      )
      // Pas de fiche CRM branchée : on s'arrête APRÈS la relecture du contact.
      jest.spyOn(svc, 'findContactRecord').mockResolvedValue({ email: 'x@y.fr' } as never)
      const out = await svc.adoptCrmValue(ME, id, 'email')
      return (
        contacts.findOne.mock.results.length > 0 &&
        (await contacts.findOne.mock.results[0]!.value) !== null &&
        out !== undefined
      )
    },
  }
}

function lemlistService(rows: Row[]) {
  const connection = { id: 'conn', workspace_id: WS, credentials_enc: 'enc(KEY)', created_at: new Date() }
  return new LemlistService(
    { findOne: jest.fn(async () => connection), update: jest.fn() } as never,
    { find: jest.fn(async () => []), upsert: jest.fn(), update: jest.fn() } as never,
    repo(rows) as never,
    { findOne: jest.fn(async () => null) } as never,
    workspaceContext() as never,
    {
      request: jest.fn(async () => ({ decision: 'write_now', request: { id: 'r' } })),
      recordOutcome: jest.fn(),
    } as never,
  )
}

const notFound = (p: Promise<unknown>) =>
  p.then(
    () => false,
    err => err instanceof NotFoundException,
  )

jest.mock('../crm/crm-token.crypto', () => ({
  encryptToken: (v: string) => `enc(${v})`,
  decryptToken: (v: string) => v.replace(/^enc\((.*)\)$/, '$1'),
}))

function lemlistPushGesture(): Gesture {
  return {
    name: 'lemlist.service — pushContact',
    run: async id =>
      !(await notFound(lemlistService(allContacts()).pushContact(ME, { contactId: id, campaignId: 'camp' } as never))),
  }
}

function lemlistLeadsGesture(): Gesture {
  return {
    name: 'lemlist.service — leadsForContact',
    run: async id => !(await notFound(lemlistService(allContacts()).leadsForContact(ME, id))),
  }
}

function linkedinService(interactions: Row[]) {
  return new LinkedInService(
    repo(interactions) as never,
    repo(allContacts()) as never,
    workspaceContext() as never,
    {} as never,
  )
}

function linkedinRecordGesture(): Gesture {
  return {
    name: 'linkedin.service — record',
    run: async id => {
      const interactions = {
        create: jest.fn((v: unknown) => v),
        save: jest.fn(async (v: Row) => ({ ...v, id: 'i-1', occurred_at: new Date() })),
      }
      const svc = new LinkedInService(
        interactions as never,
        repo(allContacts()) as never,
        workspaceContext() as never,
        {} as never,
      )
      return !(await notFound(svc.record(ME, { contactId: id, kind: 'message_sent' } as never)))
    },
  }
}

const interaction = (contactId: string, workspaceId: string, userId: string): Row => ({
  id: `i-${contactId}`,
  contact_id: contactId,
  workspace_id: workspaceId,
  user_id: userId,
  kind: 'connection_accepted',
  note: null,
  occurred_at: new Date('2026-10-01T08:00:00Z'),
})

function linkedinListGesture(): Gesture {
  return {
    name: 'linkedin.service — listForContact (interactions)',
    run: async id => {
      // Une interaction naît dans l'espace de celui qui l'a écrite : celui du contact, ou le mien pour ma ligne ancienne.
      const known = allContacts().find(r => r.id === id)!
      const workspaceOfInteraction = (known.workspace_id as string | null) ?? (known.user_id === ME ? WS : OTHER_WS)
      const svc = linkedinService([interaction(id, workspaceOfInteraction, 'u-colleague')])
      return (await svc.listForContact(ME, id)).length === 1
    },
  }
}

function linkedinFollowUpsGesture(): Gesture {
  return {
    name: 'linkedin.service — followUps (jointure contacts)',
    run: async id => {
      // L'interaction est DANS mon espace ; seule la jointure vers le contact peut dire non.
      const svc = linkedinService([interaction(id, WS, 'u-colleague')])
      const [followUp] = await svc.followUps(ME, 0)
      return followUp?.contactName === 'Ada'
    },
  }
}

const GESTURES: Gesture[] = [
  enrichmentGesture(),
  crmGesture(),
  lemlistPushGesture(),
  lemlistLeadsGesture(),
  linkedinRecordGesture(),
  linkedinListGesture(),
  linkedinFollowUpsGesture(),
]

describe('#4803 — les 7 gestes sur un contact portent la clé de l’ESPACE', () => {
  it.each(GESTURES.map(g => [g.name, g] as const))('%s — le contact d’un COLLÈGUE de l’espace passe', async (_n, g) => {
    expect(await g.run('c-team')).toBe(true)
  })

  it.each(GESTURES.map(g => [g.name, g] as const))('%s — le contact d’un AUTRE espace est refusé', async (_n, g) => {
    expect(await g.run('c-foreign')).toBe(false)
  })

  it.each(GESTURES.map(g => [g.name, g] as const))(
    '%s — l’ancienne ligne (workspace NULL) : son propriétaire passe',
    async (_n, g) => {
      expect(await g.run('c-legacy-mine')).toBe(true)
    },
  )

  it.each(GESTURES.map(g => [g.name, g] as const))('%s — l’ancienne ligne d’un TIERS est refusée', async (_n, g) => {
    expect(await g.run('c-legacy-other')).toBe(false)
  })
})

describe('#4803 — contactGestureWhere : une seule clé', () => {
  it('rend un OU : l’espace, ou l’ancienne ligne de son propriétaire — jamais user_id seul', () => {
    const where = contactGestureWhere(WS, ME, 'c-1')
    expect(where).toHaveLength(2)
    expect(where[0]).toMatchObject({ id: 'c-1', workspace_id: WS })
    expect(where[0]).not.toHaveProperty('user_id')
    expect(where[1]).toMatchObject({ id: 'c-1', user_id: ME })
  })

  it('accepte une liste d’ids (jointure du suivi LinkedIn)', () => {
    const where = contactGestureWhere(WS, ME, ['a', 'b'])
    expect((where[0]!.id as unknown as Op)._type).toBe('in')
  })
})

/** La barrière interdite : un `where` portant un id de contact ET `user_id: userId`. */
const SERVICES = [
  'contacts/contact-enrichment.service.ts',
  'crm/crm.service.ts',
  'lemlist/lemlist.service.ts',
  'linkedin/linkedin.service.ts',
]
const CONTACT_BARRIER =
  /\bwhere:\s*(?:\{[^{}]*\b(?:id|contact_id):[^{}]*\buser_id:\s*userId\b[^{}]*\}|\{[^{}]*\buser_id:\s*userId\b[^{}]*\b(?:id|contact_id):[^{}]*\})/
const ROW_BARRIER = /\{\s*id:\s*row\.contact_id,\s*user_id:\s*userId\s*\}/

function barriers(source: string): string[] {
  return [
    ...(source.match(new RegExp(CONTACT_BARRIER, 'g')) ?? []),
    ...(source.match(new RegExp(ROW_BARRIER, 'g')) ?? []),
  ]
}

describe('#4803 — garde d’architecture : aucun `where { id contact, user_id: userId }` ne revient', () => {
  const modules = join(__dirname, '..')

  it.each(SERVICES)('%s — aucune barrière stricte user_id sur un contact', file => {
    const source = readFileSync(join(modules, file), 'utf8')
    expect(source.length).toBeGreaterThan(1000) // la garde LIT un vrai fichier
    expect(barriers(source)).toEqual([])
  })

  it('SYNTHÉTIQUE — elle TOMBE sur un extrait fabriqué (preuve qu’elle lit)', () => {
    const fabricated = [
      'const a = await this.contacts.findOne({ where: { id: contactId, user_id: userId, deleted_at: IsNull() } })',
      'const b = await this.contacts.findOne({ where: { user_id: userId, contact_id: contactId } })',
      'where: rows.map(row => ({ id: row.contact_id, user_id: userId })),',
    ].join('\n')
    expect(barriers(fabricated)).toHaveLength(3)
  })

  it('SYNTHÉTIQUE — elle ne touche PAS une barrière légitime (connexions, préférences)', () => {
    const legit = 'const p = await this.prefs.findOne({ where: { user_id: userId } })'
    expect(barriers(legit)).toEqual([])
  })

  it('une seule définition de contactGestureWhere dans le dépôt API', () => {
    const own = readFileSync(join(__dirname, 'contact-gesture-scope.ts'), 'utf8')
    expect(own.match(/export function contactGestureWhere\(/g)).toHaveLength(1)
    const svc = readFileSync(join(__dirname, 'contacts.service.ts'), 'utf8')
    expect(svc).toMatch(/import \{ contactGestureWhere \} from '\.\/contact-gesture-scope'/)
    expect(svc).not.toMatch(/(?:function|async)\s+contactGestureWhere\s*\(/)
  })
})

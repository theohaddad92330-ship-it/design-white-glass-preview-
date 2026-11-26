import { IsNull } from 'typeorm'
import { ContactsService } from './contacts.service'
import { resolveBrand } from '@bellum/contracts'

/**
 * #4731 (suite A) — UN COÉQUIPIER AGIT SUR UN CONTACT D'UN COMPTE ANALYSÉ PAR UN AUTRE.
 *
 * Le défaut : les gestes lisaient leur cible par `{ id, user_id }` — un filtre de
 * PROPRIÉTÉ (qui a lancé l'analyse), pas de DROIT. Le coéquipier voyait le contact
 * (les lectures passent par l'espace) mais son geste rendait `not_found`. Doctrine
 * c76 : le rôle change l'ordre, jamais le contenu.
 *
 * Décision tranchée : le droit est l'ESPACE, et une ligne ANCIENNE (`workspace_id`
 * NULL) garde son geste pour son propriétaire. Le dépôt ci-dessous applique
 * RÉELLEMENT les `where` (objet ou tableau = OU, `IsNull()`, `In()`).
 *
 * Fusion du 31/10/2026 (#4808) : main a livré son propre `contacts.teammate-gestures.spec.ts` ;
 * celui-ci, de la PR, garde la preuve de la ligne ANCIENNE (contact ET compte).
 */
type Row = Record<string, unknown>
type Op = { type?: string; value?: unknown }

const USERS: Record<string, string> = { 'user-a': 'ws-1', 'user-b': 'ws-1', 'user-c': 'ws-2' }

function cellMatches(cell: unknown, expected: unknown): boolean {
  const op = expected as Op | null
  if (op && typeof op === 'object' && typeof op.type === 'string') {
    if (op.type === 'isNull') return cell === null || cell === undefined
    if (op.type === 'in') return (op.value as unknown[]).includes(cell)
    throw new Error(`opérateur non géré par le dépôt de test : ${op.type}`)
  }
  return cell === expected
}
const matches = (row: Row, where: Row | Row[]): boolean =>
  (Array.isArray(where) ? where : [where]).some(w => Object.entries(w).every(([k, v]) => cellMatches(row[k], v)))

function repoOf(rows: Row[]) {
  return {
    rows,
    findOne: jest.fn(async (opts: { where: Row | Row[] }) => rows.find(r => matches(r, opts.where)) ?? null),
    find: jest.fn(async (opts: { where: Row | Row[] }) => rows.filter(r => matches(r, opts.where))),
    update: jest.fn(async (where: Row | Row[], patch: Row) => {
      const hit = rows.filter(r => matches(r, where))
      hit.forEach(r => Object.assign(r, patch))
      return { affected: hit.length }
    }),
    save: jest.fn(async (row: Row) => row),
    query: jest.fn(async () => []),
    manager: { query: jest.fn(async () => [[], 0]) },
  }
}

const brandsStub = {
  getForUser: jest.fn().mockResolvedValue(resolveBrand(null)),
  getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
  getSendingAddress: jest.fn().mockResolvedValue(null),
}

function build() {
  const contacts = repoOf([
    { id: 'c-1', user_id: 'user-a', workspace_id: 'ws-1', account_id: 'acc-1', deleted_at: null, hidden: false },
    { id: 'c-old', user_id: 'user-a', workspace_id: null, account_id: 'acc-old', deleted_at: null, hidden: false },
  ])
  const accounts = repoOf([
    { id: 'acc-1', user_id: 'user-a', workspace_id: 'ws-1', registry_country: 'FR' },
    { id: 'acc-old', user_id: 'user-a', workspace_id: null, registry_country: 'FR' },
  ])
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async (userId: string) => ({ workspaceId: USERS[userId], role: 'member' })),
  }
  const config = { get: jest.fn().mockReturnValue(undefined) }
  const none = {} as never
  const service = new ContactsService(
    contacts as never,
    repoOf([]) as never,
    none,
    none,
    workspaceContext as never,
    none,
    none,
    config as never,
    none,
    accounts as never,
    none,
    none,
    none,
    none,
    brandsStub as never,
  )
  return { service, contacts, accounts }
}

const notFound = (r: unknown): boolean =>
  (r as { type?: string; problem?: { code?: string } }).type === 'failure' &&
  (r as { problem?: { code?: string } }).problem?.code === 'not_found'

type Gesture = { name: string; run: (s: ContactsService, id: string, userId: string) => Promise<{ type: string }> }

const GESTURES: Gesture[] = [
  { name: 'changer un statut', run: (s, id, u) => s.updateStatus(id, u, 'contacted') },
  { name: 'noter', run: (s, id, u) => s.updateNote(id, u, 'à rappeler') },
  { name: 'masquer', run: (s, id, u) => s.setHidden(id, u, true) },
  { name: 'écarter', run: (s, id, u) => s.excludeContact(id, u, 'a quitté l’entreprise') },
  { name: 'réintégrer', run: (s, id, u) => s.restoreContact(id, u) },
  { name: 'préparer un message', run: (s, id, u) => s.prepareEmail(id, u) },
  { name: 'choisir le contact d’une action', run: (s, id, u) => s.findOwnedForAction(id, u) },
]

describe('#4731 — les gestes sur un contact sont ouverts à tout l’espace', () => {
  describe.each(GESTURES)('$name', ({ run }) => {
    it('un coéquipier le peut sur le contact analysé par un autre', async () => {
      const { service } = build()
      const result = await run(service, 'c-1', 'user-b')
      expect(notFound(result)).toBe(false)
    })

    it('un AUTRE espace ne le peut pas — on ouvre à l’espace, jamais au-delà', async () => {
      const { service } = build()
      const result = await run(service, 'c-1', 'user-c')
      expect(notFound(result)).toBe(true)
    })

    it('la ligne ANCIENNE (workspace_id NULL) reste atteignable par son propriétaire, pas par un autre', async () => {
      const { service } = build()
      const owner = await run(service, 'c-old', 'user-a')
      expect(notFound(owner)).toBe(false)
      const stranger = await run(service, 'c-old', 'user-b')
      expect(notFound(stranger)).toBe(true)
    })
  })

  describe('lecture en lot (envoi groupé)', () => {
    it('un coéquipier atteint les contacts de l’espace, jamais ceux d’un autre', async () => {
      const { service } = build()
      const mine = await service.sendEmailBulk(['c-1'], 'user-b')
      const theirs = await service.sendEmailBulk(['c-1'], 'user-c')
      const reasonOf = (r: Awaited<typeof mine>) => (r.type === 'success' ? r.output.skipped[0]?.reason : 'failure')
      expect(reasonOf(mine)).not.toBe('not_found')
      expect(reasonOf(theirs)).toBe('not_found')
    })

    it('le propriétaire d’une ligne ancienne la garde', async () => {
      const { service } = build()
      const owner = await service.sendEmailBulk(['c-old'], 'user-a')
      const stranger = await service.sendEmailBulk(['c-old'], 'user-b')
      const reasonOf = (r: Awaited<typeof owner>) => (r.type === 'success' ? r.output.skipped[0]?.reason : 'failure')
      expect(reasonOf(owner)).not.toBe('not_found')
      expect(reasonOf(stranger)).toBe('not_found')
    })
  })

  describe('enrichir un contact', () => {
    it('le compte du contact est lu par l’espace : le coéquipier ne perd pas le pays ni l’ancrage', async () => {
      const { service, accounts } = build()
      const cfg = (service as unknown as { config: { get: jest.Mock } }).config
      cfg.get.mockReturnValue('FR')
      await service.preflightEnrichment('c-1', 'user-b').catch(() => undefined)
      const countryRead = accounts.findOne.mock.calls.find(([o]) => (o as { select?: unknown }).select)
      expect(countryRead).toBeDefined()
      const found = await accounts.findOne(countryRead![0] as never)
      expect(found).toMatchObject({ id: 'acc-1' })
    })

    it('le propriétaire garde le compte ancien, un autre espace ne le lit pas', async () => {
      const { service, accounts } = build()
      const cfg = (service as unknown as { config: { get: jest.Mock } }).config
      cfg.get.mockReturnValue('FR')
      await service.preflightEnrichment('c-old', 'user-a').catch(() => undefined)
      const read = accounts.findOne.mock.calls.find(([o]) => (o as { select?: unknown }).select)
      expect(await accounts.findOne(read![0] as never)).toMatchObject({ id: 'acc-old' })
      accounts.findOne.mockClear()
      await service.preflightEnrichment('c-old', 'user-b').catch(() => undefined)
      expect(accounts.findOne).not.toHaveBeenCalled()
    })
  })

  it('garde-fou du dépôt de test : IsNull() est bien lu', () => {
    expect(matches({ a: null }, { a: IsNull() })).toBe(true)
    expect(matches({ a: 'x' }, { a: IsNull() })).toBe(false)
  })
})

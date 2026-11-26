/**
 * Perf P5 (29/09/2026) — les lectures INDÉPENDANTES de la liste des contacts et
 * du classement d'un compte partent ENSEMBLE, jamais en série.
 *
 * Mesuré en prod : `GET /contacts` jusqu'à 5,8 s, `GET /contacts/account/:id/ranking`
 * 4,9 s, `POST /analysis/:id/enrichment-plan` 5,0 s. La cause commune : des `await`
 * qui s'enchaînent sur des lectures qui ne dépendent pas l'une de l'autre.
 *
 * La garde mesure la CONCURRENCE (pic de requêtes en vol) et le NOMBRE de requêtes :
 * un compte qui ne dépend pas du nombre de lignes (3 puis 30) et un pic ≥ plancher.
 * Remise du défaut (retour aux `await` en série) : le pic retombe à 1 et le test
 * rougit.
 */
import { ContactsService } from './contacts.service'
import { createMockRepository } from '../../database/test-utils'

/** Fait vivre une « requête » un tour de boucle, en notant le pic de requêtes en vol. */
class Concurrency {
  inFlight = 0
  peak = 0
  started = 0
  async run<T>(value: T): Promise<T> {
    this.started += 1
    this.inFlight += 1
    this.peak = Math.max(this.peak, this.inFlight)
    await new Promise(resolve => setImmediate(resolve))
    this.inFlight -= 1
    return value
  }
}

const build = (extra: { outcomes?: unknown; intakeExclusions?: unknown } = {}) => {
  const contacts = createMockRepository()
  const accounts = createMockRepository()
  const workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }) }
  const service = new ContactsService(
    contacts as never,
    createMockRepository() as never,
    { enrichContact: jest.fn() } as never,
    {} as never,
    workspace as never,
    {} as never,
    {} as never,
    { get: jest.fn() } as never,
    {} as never,
    accounts as never,
    createMockRepository() as never,
    {} as never,
    {} as never,
    createMockRepository() as never,
    {} as never,
    undefined, // analytics
    undefined, // providerCosts
    undefined, // provenance
    undefined, // sprintBus
    undefined, // crmConnections
    undefined, // enrichmentDuration
    undefined, // personErasures
    undefined, // contactStops
    extra.outcomes as never,
    // #4456 — le dépôt des raisons de rejet : SANS lui, `preCreationExclusionsTally` rend `undefined`
    // sans lire, et la garde ne comptait que cinq lectures sur les six qu'elle nomme.
    extra.intakeExclusions as never,
  )
  return { service, contacts, accounts }
}

describe('ContactsService — lectures indépendantes en parallèle (P5)', () => {
  it.each([3, 30])('findAllForUser : total, page et agrégats en vol ensemble (%i lignes)', async n => {
    const c = new Concurrency()
    // La 6e lecture nommée ci-dessous (« raisons de rejet ») vit sur un AUTRE dépôt : il faut
    // l'injecter, sinon elle ne part pas du tout et la garde laisserait passer sa mise en série.
    const intakeExclusions = createMockRepository()
    intakeExclusions._qb.getRawMany.mockImplementation(() => c.run([]))
    const { service, contacts } = build({ intakeExclusions })
    const rows = Array.from({ length: n }, (_, i) => ({
      id: `c${i}`,
      account_id: 'a1',
      full_name: `Contact ${i}`,
      user_status: 'new',
      created_at: new Date('2026-09-01T00:00:00Z'),
      updated_at: new Date('2026-09-01T00:00:00Z'),
      company_name: 'Acme',
    }))
    const qb = contacts._qb
    qb.getCount.mockImplementation(() => c.run(n))
    qb.getRawMany.mockImplementation(() => c.run(rows))
    qb.getRawOne.mockImplementation(() => c.run({ count: 0, unsubscribed: 0, stopped: 0, duplicate: 0 }))

    const result = await service.findAllForUser('user-1')

    expect(result.data).toHaveLength(n)
    // 1 total + 1 page + 1 tally + 1 delta hebdo + 1 raisons de rejet + 1 chiffres des puces (#4527) = 6, QUEL QUE SOIT n.
    expect(c.started).toBe(6)
    // Le défaut (tout en série) donnait un pic de 1.
    expect(c.peak).toBeGreaterThanOrEqual(5)
  })

  it('findAllForUser : le tally ne mute pas le qb partagé (le delta hebdo compte bien la population)', async () => {
    const { service, contacts } = build()
    const qb = contacts._qb
    qb.getCount.mockResolvedValue(0)
    qb.getRawMany.mockResolvedValue([])
    qb.getRawOne.mockResolvedValue({ count: 4, unsubscribed: 0, stopped: 0, duplicate: 0 })
    // `clone()` renvoie le même faux qb : on compte donc les appels à `clone()` —
    // le tally DOIT cloner avant de projeter/grouper (sinon les trois autres
    // agrégats, en parallèle, hériteraient de son GROUP BY).
    const clonesBefore = qb.clone.mock.calls.length
    await service.findAllForUser('user-1')
    // total + tally + delta hebdo + raisons = 4 clones au minimum sur la 1re page.
    expect(qb.clone.mock.calls.length - clonesBefore).toBeGreaterThanOrEqual(4)
  })

  it.each([3, 30])('rankForAccount : contacts et fiches incorrectes en vol ensemble, puis le compte (%i)', async n => {
    const c = new Concurrency()
    const outcomes = { incorrectContactIds: jest.fn(() => c.run(new Set<string>())) }
    const { service, contacts, accounts } = build({ outcomes })
    const rows = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, account_id: 'a1', full_name: `C ${i}` }))
    contacts.find.mockImplementation(() => c.run(rows))
    accounts.findOne.mockImplementation(() => c.run({ id: 'a1', raw_analysis: null }))

    await service.rankForAccount('a1', 'user-1', {} as never)

    // 1 contacts.find + 1 outcomes (ensemble) puis 1 accounts.findOne, indépendant de n.
    expect(c.started).toBe(3)
    // Le défaut (quatre lectures en série) donnait un pic de 1.
    expect(c.peak).toBe(2)
  })

  it('findByAccount({ scored:false }) ne relit PAS le compte pour scorer', async () => {
    const { service, contacts, accounts } = build()
    contacts.find.mockResolvedValue([{ id: 'c1', account_id: 'a1', full_name: 'Marie Curie', email: 'm@a.fr' }])

    const scored = await service.findByAccount('a1', 'user-1', null)
    expect(accounts.findOne).toHaveBeenCalledTimes(1)

    accounts.findOne.mockClear()
    const plain = await service.findByAccount('a1', 'user-1', null, { scored: false })
    expect(accounts.findOne).not.toHaveBeenCalled()
    expect(plain.map(row => row.id)).toEqual(scored.map(row => row.id))
    expect(plain[0]).not.toHaveProperty('contact_score')
  })

  // `GET /contacts/tags` (2,3 s) : la requête doit porter le prédicat de l'index
  // partiel `idx_contacts_workspace_tagged` (migration P5), sinon Postgres ne peut
  // pas l'utiliser et lit tous les contacts de l'espace.
  it('listTags : une seule requête, qui porte le prédicat de l’index partiel des étiquettes', async () => {
    const { service, contacts } = build()
    contacts.query.mockResolvedValue([{ tag: 'SAP' }, { tag: 'sap' }, { tag: 'Cloud' }])

    const tags = await service.listTags('user-1')

    expect(contacts.query).toHaveBeenCalledTimes(1)
    expect(String(contacts.query.mock.calls[0]?.[0])).toContain('cardinality(c.tags) > 0')
    expect(tags).toEqual(expect.arrayContaining(['Cloud']))
  })

  // `GET /contacts/counts/ready-to-process` (3,2 s) : le sous-select des comptes
  // suivis balayait les comptes de TOUS les espaces (non corrélé). Il est corrélé
  // par la clé primaire : l'ancienne forme `IN (SELECT a.id FROM accounts …)`
  // fait rougir ce test.
  it('countReadyToProcess : les comptes suivis se lisent par clé primaire, jamais par balayage', async () => {
    const { service, contacts } = build()
    contacts._qb.getCount.mockResolvedValue(4)

    const count = await service.countReadyToProcess('user-1')

    expect(count).toBe(4)
    const clauses = contacts._qb.andWhere.mock.calls.map(call => String(call[0]))
    expect(clauses.some(sql => sql.includes('EXISTS (SELECT 1 FROM accounts a WHERE a.id = contact.account_id'))).toBe(
      true,
    )
    expect(clauses.some(sql => sql.includes('account_id IN (SELECT a.id FROM accounts a'))).toBe(false)
  })
})

import type { EntityManager } from 'typeorm'
import { PERSON_ERASURE_HMAC_KEY_ENV } from '../../common/person-erasure-hmac'
import {
  purgeErasedPersonFromSharedBase,
  sharedAnonymousRolesForCompany,
  sharedCoordinatesForPerson,
  sharedSeedsForCompany,
  upsertSharedCompanyPeople,
  type SharedSourceContact,
} from './shared-company-facts-writes'
import { sharedPersonFingerprints } from './shared-person-fingerprint'

const TEST_KEY = 'test-only-person-erasure-key-0123456789abcdef'
const COMPANY = 'siren_552120222'

type Query = { sql: string; params: unknown[] }

function fakeManager(responder: (sql: string, params: unknown[]) => unknown[] = () => []) {
  const queries: Query[] = []
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params })
    return responder(sql, params)
  })
  return { queries, manager: { query } as unknown as Pick<EntityManager, 'query'> & { query: typeof query } }
}

const inserts = (queries: Query[]) => queries.filter(q => /INSERT INTO shared_company_people/.test(q.sql))

function contact(overrides: Partial<SharedSourceContact> = {}): SharedSourceContact {
  return {
    source: 'pappers',
    fullName: 'Claire Perrin',
    title: 'Directrice des SI',
    linkedinUrl: 'https://www.linkedin.com/in/claire-perrin/',
    apolloId: null,
    ...overrides,
  }
}

describe('#3989 — la base commune reçoit ce que Bellum a collecté, et l’anonyme de ce que les utilisateurs ont apporté', () => {
  const saved = process.env[PERSON_ERASURE_HMAC_KEY_ENV]
  beforeEach(() => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
  })
  afterAll(() => {
    if (saved === undefined) delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    else process.env[PERSON_ERASURE_HMAC_KEY_ENV] = saved
  })

  it('#3989 (Louis 15/10) — une personne apportée par un utilisateur est GARDÉE même sans poste exploitable : jamais de coordonnée, jamais de nom', async () => {
    const { manager, queries } = fakeManager()
    const written = await upsertSharedCompanyPeople(
      manager,
      'live',
      COMPANY,
      [
        contact({
          source: 'import',
          fullName: 'Marc Lefèvre',
          title: 'DSI — marc@acme.fr',
          linkedinUrl: 'https://x/y',
        }),
        contact({ source: 'manual', fullName: 'Léa Roy', title: null, linkedinUrl: null }),
      ],
      new Set(),
    )
    expect(written).toBe(2)
    for (const insert of inserts(queries)) {
      // origin 'user', full_name NULL, title NULL, linkedin_url NULL, aucune empreinte.
      expect(insert.params[2]).toBe('user')
      expect(insert.params.slice(4, 8)).toEqual([null, null, null, []])
    }
  })

  it('un fait collecté par Bellum entre NOMMÉ, avec ses empreintes d’effacement de portée « base commune »', async () => {
    const { manager, queries } = fakeManager()
    const written = await upsertSharedCompanyPeople(manager, 'live', COMPANY, [contact()], new Set())
    expect(written).toBe(1)
    const [insert] = inserts(queries)
    expect(insert?.params.slice(0, 6)).toEqual([
      'live',
      COMPANY,
      'bellum',
      expect.stringMatching(/^[0-9a-f]{64}$/),
      'Claire Perrin',
      'Directrice des SI',
    ])
    const prints = insert?.params[7] as string[]
    expect(prints.length).toBeGreaterThan(0)
    expect(prints).toEqual(
      sharedPersonFingerprints({
        fullName: 'Claire Perrin',
        linkedinUrl: 'https://www.linkedin.com/in/claire-perrin/',
        companyKey: COMPANY,
      }),
    )
  })

  it('un fait importé par un utilisateur entre ANONYMISÉ — ni nom, ni profil, ni empreinte', async () => {
    const { manager, queries } = fakeManager()
    await upsertSharedCompanyPeople(manager, 'live', COMPANY, [contact({ source: 'import' })], new Set())
    const [insert] = inserts(queries)
    expect(insert?.params).toEqual([
      'live',
      COMPANY,
      'user',
      expect.stringMatching(/^[0-9a-f]{64}$/),
      null,
      'Directrice des SI',
      null,
      [],
      'current',
      null,
    ])
    expect(JSON.stringify(insert?.params)).not.toContain('Perrin')
  })

  it('sait dire NON — une personne effacée ne revient pas dans la base commune', async () => {
    const { manager, queries } = fakeManager()
    const erased = new Set(sharedPersonFingerprints({ fullName: 'Claire Perrin', companyKey: COMPANY }))
    const written = await upsertSharedCompanyPeople(manager, 'live', COMPANY, [contact()], erased)
    expect(written).toBe(0)
    expect(inserts(queries)).toEqual([])
  })

  it('sait dire NON — sans clé d’empreinte, aucun fait NOMMÉ ne sort (l’anonyme, si)', async () => {
    delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    const { manager, queries } = fakeManager()
    const written = await upsertSharedCompanyPeople(
      manager,
      'live',
      COMPANY,
      [contact(), contact({ source: 'manual', title: 'Acheteur IT' })],
      new Set(),
    )
    expect(written).toBe(1)
    expect(inserts(queries).map(q => q.params[2])).toEqual(['user'])
  })

  it('la démo et une copie déjà venue de la base commune ne repartent jamais', async () => {
    const { manager, queries } = fakeManager()
    await upsertSharedCompanyPeople(
      manager,
      'live',
      COMPANY,
      [contact({ source: 'demo' }), contact({ source: 'shared_base' })],
      new Set(),
    )
    expect(inserts(queries)).toEqual([])
  })

  it('les seeds d’un compte : les faits NOMMÉS seulement, source « shared_base », et l’identifiant de la ligne', async () => {
    const { manager } = fakeManager(sql =>
      /FROM shared_company_people/.test(sql)
        ? [
            {
              id: 'f-1',
              full_name: 'Claire Perrin',
              title: 'DSI',
              linkedin_url: null,
              employment_state: 'current',
              last_seen_at: new Date().toISOString(),
            },
          ]
        : [],
    )
    const seeds = await sharedSeedsForCompany(manager, 'live', COMPANY)
    expect(seeds).toEqual([
      {
        fullName: 'Claire Perrin',
        title: 'DSI',
        linkedinUrl: '',
        city: '',
        country: '',
        source: 'shared_base',
        sharedFactId: 'f-1',
      },
    ])
    expect((manager.query.mock.calls[0]?.[0] as string) ?? '').toMatch(/origin = 'bellum'/)
  })

  it('l’effacement purge la base commune et pose l’empreinte qui empêche la recollecte', async () => {
    const prints = sharedPersonFingerprints({ fullName: 'Claire Perrin', companyKey: COMPANY })
    // TypeORM rend `[lignes, nombre]` pour un DELETE … RETURNING (garde `returned-rows.spec.ts`).
    const { manager, queries } = fakeManager(sql =>
      /DELETE FROM shared_company_people/.test(sql) ? [[{ id: 'f-1' }, { id: 'f-2' }], 2] : [],
    )
    const purged = await purgeErasedPersonFromSharedBase(manager, prints)
    expect(purged).toEqual(['f-1', 'f-2'])
    const erasure = queries.find(q => /INSERT INTO shared_person_erasures/.test(q.sql))
    expect(erasure?.params).toEqual([prints])
  })

  it('sait dire NON — aucune empreinte, aucune écriture', async () => {
    const { manager, queries } = fakeManager()
    expect(await purgeErasedPersonFromSharedBase(manager, [])).toEqual([])
    expect(queries).toEqual([])
  })
})

// #3989.7 — Louis 15/10/2026 : une coordonnée PRO trouvée dans un espace est réutilisée dans un autre.
describe('#3989.7 — les coordonnées pro trouvées par Bellum suivent la personne, la donnée seule', () => {
  const saved = process.env[PERSON_ERASURE_HMAC_KEY_ENV]
  beforeEach(() => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
  })
  afterAll(() => {
    if (saved === undefined) delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    else process.env[PERSON_ERASURE_HMAC_KEY_ENV] = saved
  })
  const coordinateInserts = (queries: Query[]) =>
    queries.filter(q => /INSERT INTO shared_person_coordinates/.test(q.sql))
  const withFactId = (sql: string) => (/INSERT INTO shared_company_people/.test(sql) ? [{ id: 'f-1' }] : [])

  it('une fiche Bellum verse son e-mail pro et son téléphone, rattachés au fait commun — sans espace ni coût', async () => {
    const { manager, queries } = fakeManager(withFactId)
    await upsertSharedCompanyPeople(
      manager,
      'live',
      COMPANY,
      [contact({ source: 'dropcontact', email: 'claire.perrin@airbus.com', phone: '+33 6 12 34 56 78' })],
      new Set(),
    )
    const [insert] = coordinateInserts(queries)
    expect(insert?.params).toEqual(['f-1', 'claire.perrin@airbus.com', '+33 6 12 34 56 78'])
    expect(insert?.sql).not.toMatch(/workspace|cost|credit|note|status/i)
  })

  it('sait dire NON — une fiche importée, une coordonnée corrigée à la main, une personne effacée : rien ne sort', async () => {
    const { manager, queries } = fakeManager(withFactId)
    const claire = contact({ email: 'claire.perrin@airbus.com' })
    const erased = new Set(
      sharedPersonFingerprints({ fullName: 'Claire Perrin', linkedinUrl: claire.linkedinUrl, companyKey: COMPANY }),
    )
    await upsertSharedCompanyPeople(manager, 'live', COMPANY, [claire], erased)
    await upsertSharedCompanyPeople(
      manager,
      'live',
      COMPANY,
      [contact({ source: 'import', email: 'm@airbus.com' })],
      new Set(),
    )
    await upsertSharedCompanyPeople(
      manager,
      'live',
      COMPANY,
      [contact({ email: 'claire.perrin@airbus.com', humanCoordinates: true })],
      new Set(),
    )
    expect(coordinateInserts(queries)).toEqual([])
  })

  it('la recopie dans un nouvel espace porte la coordonnée trouvée ailleurs', async () => {
    const { manager } = fakeManager(() => [
      {
        id: 'f-1',
        full_name: 'Claire Perrin',
        title: 'DSI',
        linkedin_url: null,
        email: 'c.p@airbus.com',
        phone: null,
        employment_state: 'current',
        last_seen_at: new Date().toISOString(),
      },
    ])
    const [seed] = await sharedSeedsForCompany(manager, 'live', COMPANY)
    expect(seed?.sharedCoordinates).toEqual({ email: 'c.p@airbus.com', phone: null })
  })
})

describe('#4268.b — l’enrichissement à la demande lit d’abord la coordonnée du commun', () => {
  const saved = process.env[PERSON_ERASURE_HMAC_KEY_ENV]
  beforeEach(() => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
  })
  afterAll(() => {
    if (saved === undefined) delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    else process.env[PERSON_ERASURE_HMAC_KEY_ENV] = saved
  })
  const claire = {
    fullName: 'Claire Perrin',
    linkedinUrl: 'https://www.linkedin.com/in/claire-perrin/',
    apolloId: null,
  }

  it('trouve la personne par ses empreintes dans SA société, fait Bellum seulement, borné à la fraîcheur du cache', async () => {
    const { manager, queries } = fakeManager(() => [{ email: 'claire.perrin@airbus.com', phone: null }])
    const found = await sharedCoordinatesForPerson(manager, 'live', COMPANY, claire, 30 * 86400)
    expect(found).toEqual({ email: 'claire.perrin@airbus.com', phone: null })
    const [read] = queries
    expect(read?.sql).toMatch(/JOIN shared_person_coordinates/)
    expect(read?.sql).toMatch(/p\.origin = 'bellum'/)
    expect(read?.sql).toMatch(/person_fingerprints && \$3/)
    expect(read?.sql).toMatch(/last_seen_at >= now\(\) - make_interval\(secs => \$4\)/)
    expect(read?.params).toEqual([
      'live',
      COMPANY,
      sharedPersonFingerprints({ ...claire, companyKey: COMPANY }),
      30 * 86400,
    ])
    // Aucune donnée d'espace lue ni rendue : ni espace, ni note, ni statut, ni coût.
    expect(read?.sql).not.toMatch(/workspace|note|status|cost|credit/i)
  })

  it('sait dire NON — sans clé d’empreinte, sans nom ni profil, ou rien en base : aucune coordonnée', async () => {
    const { manager, queries } = fakeManager(() => [])
    expect(await sharedCoordinatesForPerson(manager, 'live', COMPANY, claire, 30 * 86400)).toBeNull()
    expect(
      await sharedCoordinatesForPerson(manager, 'live', COMPANY, { fullName: '', linkedinUrl: null }, 86400),
    ).toBeNull()
    delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    const before = queries.length
    expect(await sharedCoordinatesForPerson(manager, 'live', COMPANY, claire, 86400)).toBeNull()
    expect(queries.length).toBe(before)
  })
})

/**
 * #4286.15.b (Louis 19/10/2026, #4268) — les anciens se partagent, jamais présentés comme actuels ;
 * un fait périmé redevient inconnu ; on archive, on ne supprime pas.
 */
describe('#4286.15.b — l’état employeur voyage avec le fait commun', () => {
  const saved = process.env[PERSON_ERASURE_HMAC_KEY_ENV]
  beforeEach(() => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
  })
  afterAll(() => {
    if (saved === undefined) delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    else process.env[PERSON_ERASURE_HMAC_KEY_ENV] = saved
  })

  it('chaque observation pose l’état, la date de départ connue et `last_seen_at`', async () => {
    const { manager, queries } = fakeManager()
    await upsertSharedCompanyPeople(
      manager,
      'live',
      COMPANY,
      [contact({ employmentState: 'former', leftAt: '2026-09-30' }), contact({ fullName: 'Paul Martin' })],
      new Set(),
    )
    const [former, current] = inserts(queries)
    expect(former?.sql).toMatch(/employment_state/)
    expect(former?.sql).toMatch(/last_seen_at = now\(\)/)
    expect(former?.params).toEqual(expect.arrayContaining(['former', '2026-09-30']))
    expect(current?.params).toEqual(expect.arrayContaining(['current', null]))
  })

  it('sait dire NON — une date de départ n’accompagne jamais une personne actuelle', async () => {
    const { manager, queries } = fakeManager()
    await upsertSharedCompanyPeople(manager, 'live', COMPANY, [contact({ leftAt: '2026-09-30' })], new Set())
    expect(inserts(queries)[0]?.params).toEqual(expect.arrayContaining(['current', null]))
    expect(inserts(queries)[0]?.params).not.toContain('2026-09-30')
  })

  it('un ANCIEN reste ancien : une observation « actuelle » plus tard ne le fait pas revenir', async () => {
    const { manager, queries } = fakeManager()
    await upsertSharedCompanyPeople(manager, 'live', COMPANY, [contact()], new Set())
    expect(inserts(queries)[0]?.sql).toMatch(
      /employment_state = CASE WHEN shared_company_people\.employment_state = 'former' OR EXCLUDED\.employment_state = 'former' THEN 'former' ELSE 'current' END/,
    )
  })

  it('sait dire NON — la recopie dans un autre espace ne lit ni un ancien ni un fait périmé', async () => {
    const stale = new Date(Date.now() - 400 * 86_400_000).toISOString()
    const fresh = new Date().toISOString()
    const { manager } = fakeManager(sql =>
      /FROM shared_company_people/.test(sql)
        ? [
            {
              id: 'f-1',
              full_name: 'Claire Perrin',
              title: 'DSI',
              linkedin_url: null,
              employment_state: 'current',
              last_seen_at: fresh,
            },
            {
              id: 'f-2',
              full_name: 'Ancien Salarié',
              title: 'DAF',
              linkedin_url: null,
              employment_state: 'former',
              last_seen_at: fresh,
            },
            {
              id: 'f-3',
              full_name: 'Perdu DeVue',
              title: 'DRH',
              linkedin_url: null,
              employment_state: 'current',
              last_seen_at: stale,
            },
          ]
        : [],
    )
    const seeds = await sharedSeedsForCompany(manager, 'live', COMPANY)
    expect(seeds.map(seed => seed.sharedFactId)).toEqual(['f-1'])
    const sql = (manager.query.mock.calls[0]?.[0] as string) ?? ''
    expect(sql).toMatch(/employment_state = 'current'/)
    expect(sql).toMatch(/last_seen_at >= now\(\) - make_interval/)
  })

  it('les rôles anonymes et la coordonnée d’une personne ne lisent que des faits ACTUELS', async () => {
    const { manager } = fakeManager()
    await sharedAnonymousRolesForCompany(manager, 'live', COMPANY)
    await sharedCoordinatesForPerson(manager, 'live', COMPANY, { fullName: 'Claire Perrin' }, 3600)
    const sqls = manager.query.mock.calls.map(call => String(call[0]))
    expect(sqls).toHaveLength(2)
    for (const sql of sqls) expect(sql).toMatch(/employment_state = 'current'/)
  })
})

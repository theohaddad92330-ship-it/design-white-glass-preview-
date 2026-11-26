import type { DataSource } from 'typeorm'
import { PERSON_ERASURE_HMAC_KEY_ENV } from '../../common/person-erasure-hmac'
import { SharedCompanyFactsService } from './shared-company-facts.service'

const TEST_KEY = 'test-only-person-erasure-key-0123456789abcdef'

/** Un constructeur de requête qui ENREGISTRE ce qu'on lui demande — rien n'est simulé au-delà. */
function recordingBuilder(rows: unknown[]) {
  const clauses: string[] = []
  const params: Record<string, unknown> = {}
  const selects: string[] = []
  const builder = {
    innerJoin: jest.fn((table: string, _alias: string, on: string) => {
      clauses.push(`JOIN ${table} ON ${on}`)
      return builder
    }),
    select: jest.fn((columns: string[]) => {
      selects.push(...columns)
      return builder
    }),
    addSelect: jest.fn((column: string) => {
      selects.push(column)
      return builder
    }),
    where: jest.fn((clause: string) => {
      clauses.push(clause)
      return builder
    }),
    andWhere: jest.fn((clause: string, values?: Record<string, unknown>) => {
      clauses.push(clause)
      Object.assign(params, values ?? {})
      return builder
    }),
    getRawMany: jest.fn(async () => rows),
  }
  return { builder, clauses, params, selects }
}

function harness(contacts: Array<Record<string, string | boolean | null>>) {
  const queries: Array<{ sql: string; params: unknown[] }> = []
  const read = recordingBuilder(contacts)
  const dataSource = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      return []
    }),
    getRepository: jest.fn(() => ({ createQueryBuilder: jest.fn(() => read.builder) })),
  } as unknown as DataSource
  return { service: new SharedCompanyFactsService(dataSource), queries, read }
}

const row = (overrides: Record<string, string | boolean | null> = {}) => ({
  siren: '552120222',
  website: null,
  source: 'pappers',
  full_name: 'Claire Perrin',
  title: 'DSI',
  linkedin_url: null,
  apollo_id: null,
  human_corrected: false,
  ...overrides,
})

describe('SharedCompanyFactsService — #3989 le versement nocturne des faits société', () => {
  const saved = process.env[PERSON_ERASURE_HMAC_KEY_ENV]
  beforeEach(() => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
  })
  afterAll(() => {
    if (saved === undefined) delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    else process.env[PERSON_ERASURE_HMAC_KEY_ENV] = saved
  })

  it('ne lit que les espaces RÉELS et les sources qui ont une réponse écrite (jamais demo ni shared_base)', async () => {
    const { service, read } = harness([])
    await service.harvest()
    expect(read.clauses).toContain('w.is_demo = false')
    const sources = read.params.sources as string[]
    expect(sources).toEqual(expect.arrayContaining(['pappers', 'import', 'manual', 'crm']))
    expect(sources).not.toContain('demo')
    expect(sources).not.toContain('shared_base')
  })

  it('regroupe par société commune ; une société sans SIREN ni site ne se partage pas', async () => {
    const { service, queries } = harness([
      row(),
      row({ source: 'import', full_name: 'Marc Lefèvre', title: 'Acheteur IT' }),
      row({ siren: null, website: null, full_name: 'Paul Sansclé' }),
    ])
    const report = await service.harvest()
    expect(report).toMatchObject({ companies: 1, facts: 2 })
    const written = queries.filter(q => /INSERT INTO shared_company_people/.test(q.sql))
    expect(written.map(q => [q.params[1], q.params[2], q.params[4]])).toEqual([
      ['siren_552120222', 'bellum', 'Claire Perrin'],
      ['siren_552120222', 'user', null],
    ])
    expect(JSON.stringify(written)).not.toContain('Lefèvre')
    expect(JSON.stringify(written)).not.toContain('Sansclé')
  })

  // #3989.c — le versement relisait TOUT le parc chaque nuit. Les écritures sont
  // idempotentes et ne font que compléter : seules les fiches TOUCHÉES depuis
  // l'avant-veille changent quelque chose, un passage complet hebdomadaire
  // rattrape le reste (panne de plus de 48 h comprise).
  describe('#3989.c — incrémental en semaine, complet le dimanche', () => {
    const MONDAY = new Date('2026-10-12T00:53:00Z')
    const SUNDAY = new Date('2026-10-11T00:53:00Z')

    it('en semaine : ne relit que les fiches modifiées depuis 48 h', async () => {
      const { service, read } = harness([])
      const report = await service.harvest(MONDAY)
      expect(report.mode).toBe('incremental')
      expect(read.clauses).toContain('c.updated_at >= :since')
      expect(new Date(read.params.since as Date).toISOString()).toBe('2026-10-10T00:53:00.000Z')
    })

    it('le dimanche : relit tout le parc, sans filtre de date', async () => {
      const { service, read } = harness([])
      const report = await service.harvest(SUNDAY)
      expect(report.mode).toBe('full')
      expect(read.clauses).not.toContain('c.updated_at >= :since')
    })

    it('sait dire NON : un passage forcé complet ignore le jour de la semaine', async () => {
      const { service, read } = harness([])
      const report = await service.harvest(MONDAY, { full: true })
      expect(report.mode).toBe('full')
      expect(read.clauses).not.toContain('c.updated_at >= :since')
    })
  })

  // #3989.b — une correction humaine du nom ou du poste (provenance `human`,
  // `PATCH /contacts/:id`) gagne toujours : la base commune ne l'écrase jamais
  // et ne la porte jamais comme un fait NOMMÉ de Bellum (c'est un fait apporté
  // par l'utilisateur : le rôle part, la personne reste chez lui).
  describe('#3989.b — une correction humaine du nom/poste survit au versement', () => {
    const MONDAY = new Date('2026-10-12T00:53:00Z')
    const SUNDAY = new Date('2026-10-11T00:53:00Z')
    const corrected = row({ full_name: 'Claire Perrin-Martin', title: 'DSI groupe', human_corrected: true })

    it.each([
      ['incrémental', MONDAY],
      ['complet', SUNDAY],
    ])('passage %s : la fiche corrigée repart ANONYMISÉE, jamais avec son nom', async (_mode, now) => {
      const { service, queries } = harness([corrected, row({ full_name: 'Marc Lefèvre', title: 'Acheteur IT' })])
      await service.harvest(now)
      const written = queries.filter(q => /INSERT INTO shared_company_people/.test(q.sql))
      expect(written.map(q => [q.params[2], q.params[4]])).toEqual([
        ['user', null],
        ['bellum', 'Marc Lefèvre'],
      ])
      expect(JSON.stringify(written)).not.toContain('Perrin-Martin')
    })

    it('ne réécrit JAMAIS une fiche d’espace : seules des lignes de la base commune sont écrites', async () => {
      const { service, queries } = harness([corrected])
      await service.harvest(SUNDAY, { full: true })
      const writes = queries.filter(q => /^\s*(INSERT|UPDATE|DELETE)/i.test(q.sql))
      expect(writes.length).toBeGreaterThan(0)
      for (const write of writes) expect(write.sql).toMatch(/shared_company_people/)
      expect(queries.some(q => /UPDATE\s+contacts/i.test(q.sql))).toBe(false)
    })

    it('sait dire NON : sans correction humaine, la source Bellum reste nommée', async () => {
      const { service, queries } = harness([row()])
      await service.harvest(SUNDAY)
      const written = queries.filter(q => /INSERT INTO shared_company_people/.test(q.sql))
      expect(written.map(q => [q.params[2], q.params[4]])).toEqual([['bellum', 'Claire Perrin']])
    })

    it('lit la provenance humaine du nom et du poste, sur le contact', async () => {
      const { service, read } = harness([])
      await service.harvest()
      expect(read.selects.join(' ')).toMatch(/field_provenance/)
      expect(read.selects.join(' ')).toMatch(/'human'/)
      expect(read.selects.join(' ')).toMatch(/fullName/)
      expect(read.selects.join(' ')).toMatch(/'title'/)
    })
  })

  it('le passage nocturne ne lève jamais : un échec se journalise, la base de la veille reste', async () => {
    const dataSource = { query: jest.fn(async () => Promise.reject(new Error('panne'))) } as unknown as DataSource
    await expect(new SharedCompanyFactsService(dataSource).runNightly()).resolves.toBeUndefined()
  })
})

describe('SharedCompanyFactsService — #4286.15.b l’état employeur de chaque fiche', () => {
  const saved = process.env[PERSON_ERASURE_HMAC_KEY_ENV]
  beforeEach(() => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
  })
  afterAll(() => {
    if (saved === undefined) delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    else process.env[PERSON_ERASURE_HMAC_KEY_ENV] = saved
  })

  it('lit le cycle de vie de la fiche et la date de son passage à l’historique', async () => {
    const { service, read } = harness([])
    await service.harvest(new Date('2026-10-22T08:00:00Z'), { full: true })
    expect(read.selects.join('\n')).toMatch(/c\.lifecycle_state AS lifecycle_state/)
    expect(read.selects.join('\n')).toMatch(/contact_lifecycle_transitions[\s\S]*to_state = 'historique'/)
  })

  it('une fiche passée à l’historique entre comme ANCIENNE, avec sa date de départ ; une autre comme actuelle', async () => {
    const { service, queries } = harness([
      row({ lifecycle_state: 'historique', left_at: '2026-09-30T10:00:00.000Z' }),
      row({ full_name: 'Paul Martin', lifecycle_state: 'a_qualifier', left_at: null }),
    ])
    await service.harvest(new Date('2026-10-22T08:00:00Z'), { full: true })
    const writes = queries.filter(q => /INSERT INTO shared_company_people/.test(q.sql))
    expect(writes[0]?.params).toEqual(expect.arrayContaining(['former', '2026-09-30']))
    expect(writes[1]?.params).toEqual(expect.arrayContaining(['current', null]))
  })
})

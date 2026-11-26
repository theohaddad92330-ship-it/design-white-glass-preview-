import { DemoLeadEntity } from '../../database/entities/demo-lead.entity'
import { DemoLeadService } from './demo-lead.service'

type Row = Partial<DemoLeadEntity> & { id: string; email: string }

// #2705.4/#2705.6 — le repository TypeORM est FAKÉ (patron mesuré dans
// `demo-pool.service.spec.ts`) : ce qui compte ici est la DÉCISION
// (créer/mettre à jour, dédupliquer, compter), pas la plomberie SQL.
function fakeRepo(rows: Row[]) {
  return {
    findOne: jest.fn(async ({ where }: { where: { email?: string; device_id?: string } }) => {
      if (where.email) return rows.find(r => r.email === where.email) ?? null
      if (where.device_id) return rows.find(r => r.device_id === where.device_id) ?? null
      return null
    }),
    find: jest.fn(async () =>
      [...rows].sort((a, b) => (b.last_access_at?.getTime() ?? 0) - (a.last_access_at?.getTime() ?? 0)),
    ),
    create: jest.fn((input: Partial<Row>) => ({ id: `lead-${rows.length + 1}`, ...input }) as Row),
    save: jest.fn(async (input: Row) => {
      const existingIndex = rows.findIndex(r => r.id === input.id)
      if (existingIndex >= 0) rows[existingIndex] = input
      else rows.push(input)
      return input
    }),
  }
}

const INPUT = {
  firstName: 'Marie',
  lastName: 'Dupont',
  email: 'Marie.Dupont@ACME.fr',
  jobTitle: 'sales_director' as const,
  company: 'Acme',
  deviceId: 'device-1',
  utm: { source: null, medium: null, campaign: null, term: null, content: null },
}

describe('DemoLeadService.registerOrTouch', () => {
  it('crée une ligne au premier envoi, access_count=1, created=true', async () => {
    const rows: Row[] = []
    const service = new DemoLeadService(fakeRepo(rows) as never)
    const outcome = await service.registerOrTouch(INPUT)
    expect(outcome.created).toBe(true)
    expect(outcome.lead.email).toBe('marie.dupont@acme.fr')
    expect(outcome.lead.access_count).toBe(1)
    expect(rows).toHaveLength(1)
  })

  // Ce test sait dire NON : sans la déduplication par e-mail normalisé, une
  // seconde soumission créerait une seconde ligne — cassé exprès une fois en
  // retirant le `findOne` par e-mail a bien fait échouer ce test.
  it('la même adresse (casse différente) MET À JOUR, ne duplique jamais', async () => {
    const rows: Row[] = []
    const service = new DemoLeadService(fakeRepo(rows) as never)
    await service.registerOrTouch(INPUT)
    const second = await service.registerOrTouch({ ...INPUT, email: 'marie.dupont@ACME.FR', deviceId: 'device-2' })
    expect(second.created).toBe(false)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.access_count).toBe(2)
    expect(rows[0]?.device_id).toBe('device-2')
  })

  it('porte les UTM présents, laisse `null` ceux qui sont absents', async () => {
    const rows: Row[] = []
    const service = new DemoLeadService(fakeRepo(rows) as never)
    const outcome = await service.registerOrTouch({
      ...INPUT,
      utm: { source: 'linkedin', medium: null, campaign: null, term: null, content: null },
    })
    expect(outcome.lead.utm_source).toBe('linkedin')
    expect(outcome.lead.utm_medium).toBeNull()
  })
})

describe('DemoLeadService.touchByDevice', () => {
  it('rend null quand aucun lead ne porte ce cookie — le formulaire doit alors s’afficher', async () => {
    const service = new DemoLeadService(fakeRepo([]) as never)
    expect(await service.touchByDevice('inconnu')).toBeNull()
  })

  it('incrémente access_count et met à jour last_access_at sans re-demander les champs', async () => {
    const rows: Row[] = [
      {
        id: 'lead-1',
        email: 'marie.dupont@acme.fr',
        first_name: 'Marie',
        device_id: 'device-1',
        access_count: 1,
        last_access_at: new Date('2026-01-01T00:00:00Z'),
      },
    ]
    const service = new DemoLeadService(fakeRepo(rows) as never)
    const touched = await service.touchByDevice('device-1')
    expect(touched).not.toBeNull()
    expect(touched?.firstName).toBe('Marie')
    expect(rows[0]?.access_count).toBe(2)
    expect(rows[0]?.last_access_at?.getTime()).toBeGreaterThan(new Date('2026-01-01T00:00:00Z').getTime())
  })
})

// #2706.1 — le back-office : « la plus récente d'abord ».
describe('DemoLeadService.listMostRecentFirst', () => {
  it('trie par dernier accès décroissant', async () => {
    const rows: Row[] = [
      { id: 'lead-old', email: 'a@acme.fr', last_access_at: new Date('2026-01-01T00:00:00Z') },
      { id: 'lead-new', email: 'b@acme.fr', last_access_at: new Date('2026-02-01T00:00:00Z') },
    ]
    const service = new DemoLeadService(fakeRepo(rows) as never)
    const list = await service.listMostRecentFirst()
    expect(list.map(l => l.id)).toEqual(['lead-new', 'lead-old'])
  })
})

import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { MarketCompanyAliasEntity } from '../../database/entities/market-company-alias.entity'
import { MarketCompanyResolutionOverrideEntity } from '../../database/entities/market-company-resolution-override.entity'
import { MarketCompanySignalEntity } from '../../database/entities/market-company-signal.entity'
import { MarketCompanyStackEntity } from '../../database/entities/market-company-stack.entity'
import { MarketEsnClientEntity } from '../../database/entities/market-esn-client.entity'
import { MarketExEsnAtClientEntity } from '../../database/entities/market-ex-esn-at-client.entity'
import { MarketPersonPathEntity } from '../../database/entities/market-person-path.entity'
import { MarketMemoryService } from './market-memory.service'

/** Lot 775 — `personPathsFor` : les parcours d'une entreprise, SANS identité, même seuls (décision Louis 02/11). */

const signal = {
  companyKey: 'thales',
  companyName: 'Thales',
  matchKey: 'thales',
  websiteDomain: null,
  pathsTotal: 1,
  roleFamilies: [],
}
const pathRow = {
  rowKey: 'r1',
  personKey: 'secret-hash',
  companyKey: 'thales',
  jobTitle: 'Data Engineer',
  roleFamily: 'Data',
  skills: ['Java', 'Kafka'],
  startDate: '2023-01-01',
  endDate: '2024-06-01',
  datePrecision: 'month',
  workStatus: 'freelance',
  esnName: 'Alten',
  dailyRateEur: 650,
  missionCity: 'Lyon',
  missionRegion: null,
}

async function build(options: { signals?: unknown[]; paths?: unknown[]; fail?: boolean }) {
  const pathFind = options.fail
    ? jest.fn().mockRejectedValue(new Error('down'))
    : jest.fn().mockResolvedValue(options.paths ?? [])
  const empty = { find: jest.fn().mockResolvedValue([]) }
  const moduleRef = await Test.createTestingModule({
    providers: [
      MarketMemoryService,
      {
        provide: getRepositoryToken(MarketCompanySignalEntity),
        useValue: { find: jest.fn().mockResolvedValue(options.signals ?? [signal]), findOne: jest.fn() },
      },
      { provide: getRepositoryToken(MarketEsnClientEntity), useValue: empty },
      { provide: getRepositoryToken(MarketCompanyStackEntity), useValue: empty },
      { provide: getRepositoryToken(MarketExEsnAtClientEntity), useValue: empty },
      { provide: getRepositoryToken(MarketCompanyAliasEntity), useValue: empty },
      { provide: getRepositoryToken(MarketCompanyResolutionOverrideEntity), useValue: empty },
      { provide: getRepositoryToken(MarketPersonPathEntity), useValue: { find: pathFind } },
    ],
  }).compile()
  return { service: moduleRef.get(MarketMemoryService), pathFind }
}

describe('MarketMemoryService.personPathsFor', () => {
  it('rend le parcours d’un compte même SEUL (le seuil de 3 ne vaut que pour les agrégats)', async () => {
    const { service } = await build({ paths: [pathRow] })
    const read = await service.personPathsFor([{ ref: 'a1', name: 'Thales' }])
    if (read.status !== 'ok') throw new Error('unavailable')
    expect(read.paths.get('a1')).toHaveLength(1)
    expect(read.paths.get('a1')?.[0]).toMatchObject({ jobTitle: 'Data Engineer', dailyRateEur: 650, esnName: 'Alten' })
  })

  it('ne laisse sortir NI le pseudonyme NI aucune clé interne', async () => {
    const { service } = await build({ paths: [pathRow] })
    const read = await service.personPathsFor([{ ref: 'a1', name: 'Thales' }])
    if (read.status !== 'ok') throw new Error('unavailable')
    expect(JSON.stringify([...read.paths.values()])).not.toMatch(/secret-hash|personKey|person_key/)
  })

  it('entreprise non reconnue ⇒ aucune entrée (une absence ne fait pas de ligne)', async () => {
    const { service, pathFind } = await build({ signals: [], paths: [pathRow] })
    const read = await service.personPathsFor([{ ref: 'a1', name: 'Inconnue' }])
    if (read.status !== 'ok') throw new Error('unavailable')
    expect(read.paths.get('a1') ?? []).toEqual([])
    expect(pathFind).not.toHaveBeenCalled()
  })

  it('une panne rend `unavailable`, jamais des parcours vides', async () => {
    const { service } = await build({ fail: true })
    expect(await service.personPathsFor([{ ref: 'a1', name: 'Thales' }])).toMatchObject({ status: 'unavailable' })
  })
})

/**
 * Lot 793 — un compte relié par le référentiel pivot (`common_account_links`) à un BM-A du pack v2.1 voit les parcours
 * rangés sous cette clé (`company_key` = BM-A, lot 791), même quand son nom ne rencontre aucune entreprise du corpus.
 */
describe('MarketMemoryService.personPathsFor — clés communes (lot 793)', () => {
  const bmPath = { ...pathRow, rowKey: 'r-bm', companyKey: 'BM-A-000001' }
  const filtering = (rows: Array<typeof pathRow>) =>
    jest.fn(async ({ where }: { where: { companyKey: { value: string[] } } }) =>
      rows.filter(row => where.companyKey.value.includes(row.companyKey)),
    )

  async function buildFiltering(signals: unknown[], rows: Array<typeof pathRow>) {
    const built = await build({ signals })
    const pathFind = filtering(rows)
    ;(built.service as unknown as { personPaths: { find: unknown } }).personPaths.find = pathFind
    return { service: built.service, pathFind }
  }

  it('nom non reconnu mais clé BM-A fournie ⇒ les parcours BM-A sortent', async () => {
    const { service } = await buildFiltering([], [bmPath])
    const read = await service.personPathsFor([{ ref: 'a1', name: 'Inconnue', commonKeys: ['BM-A-000001'] }])
    if (read.status !== 'ok') throw new Error('unavailable')
    expect(read.paths.get('a1')?.map(p => p.id)).toEqual(['r-bm'])
  })

  it('clé du corpus ET clé BM-A : l’union, chaque parcours une seule fois', async () => {
    const { service } = await buildFiltering([signal], [pathRow, bmPath])
    const read = await service.personPathsFor([{ ref: 'a1', name: 'Thales', commonKeys: ['BM-A-000001', 'thales'] }])
    if (read.status !== 'ok') throw new Error('unavailable')
    expect(
      read.paths
        .get('a1')
        ?.map(p => p.id)
        .sort(),
    ).toEqual(['r-bm', 'r1'])
  })
})

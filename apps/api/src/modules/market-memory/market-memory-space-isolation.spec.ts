import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { MarketCompanyAliasEntity } from '../../database/entities/market-company-alias.entity'
import { MarketCompanyResolutionOverrideEntity } from '../../database/entities/market-company-resolution-override.entity'
import { MarketCompanySignalEntity } from '../../database/entities/market-company-signal.entity'
import { MarketCompanyStackEntity } from '../../database/entities/market-company-stack.entity'
import { MarketEsnClientEntity } from '../../database/entities/market-esn-client.entity'
import { MarketExEsnAtClientEntity } from '../../database/entities/market-ex-esn-at-client.entity'
import { MarketMemoryService } from './market-memory.service'

/**
 * #4183 (EX-14, P0) — la LECTURE de la mémoire marché est bornée à l'espace APPELANT.
 *
 * Le corpus `market_*` est partagé (aucun `workspace_id`) ; ce qui est PAR ESPACE — les
 * décisions humaines de rapprochement, les faits d'accès datés — ne se lit que sous
 * l'espace qui demande. Un double qui SIMULE la base (filtre `where.workspaceId`, filtre
 * SQL `mine.workspace_id = $2`) est ce qui permet à ce test de dire NON : si le service
 * lisait sans espace, l'espace A verrait la décision de l'espace B.
 */

const WS_A = '0000000a-0000-4000-8000-00000000000a'
const WS_B = '0000000b-0000-4000-8000-00000000000b'
const ACC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ACC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const SIGNAL = {
  companyKey: 'thales',
  companyName: 'Thales',
  matchKey: 'thales',
  websiteDomain: 'thalesgroup.com',
  pathsTotal: 41,
  roleFamilies: [{ family: 'Data', persons: 12 }],
  city: 'Paris',
  region: 'Île-de-France',
  country: 'France',
}

async function buildService() {
  const builder: Record<string, jest.Mock> = {}
  for (const name of ['where', 'andWhere', 'orderBy', 'limit']) builder[name] = jest.fn(() => builder)
  builder.getMany = jest.fn().mockResolvedValue([SIGNAL])

  // La base des décisions humaines : B a confirmé SON compte comme étant Thales.
  const overrideRows = [
    {
      workspaceId: WS_B,
      accountId: ACC_B,
      decision: 'confirmed',
      marketCompanyKey: 'thales',
      reviewedAt: new Date(),
      reviewedBy: null,
    },
  ]
  const overrideFind = jest.fn(async (query: { where: { workspaceId: string } }) =>
    overrideRows.filter(row => row.workspaceId === query.where.workspaceId),
  )

  // Les faits d'accès : seul B a un fait daté sur ce SIREN.
  const factQueries: Array<{ sql: string; params: unknown[] }> = []
  const signalsRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([SIGNAL]),
    createQueryBuilder: jest.fn(() => builder),
    query: jest.fn(async (sql: string, params: unknown[]) => {
      factQueries.push({ sql, params })
      return []
    }),
  }

  const moduleRef = await Test.createTestingModule({
    providers: [
      MarketMemoryService,
      { provide: getRepositoryToken(MarketCompanySignalEntity), useValue: signalsRepo },
      { provide: getRepositoryToken(MarketEsnClientEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      { provide: getRepositoryToken(MarketCompanyStackEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      { provide: getRepositoryToken(MarketExEsnAtClientEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      { provide: getRepositoryToken(MarketCompanyAliasEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      { provide: getRepositoryToken(MarketCompanyResolutionOverrideEntity), useValue: { find: overrideFind } },
    ],
  }).compile()

  return { service: moduleRef.get(MarketMemoryService), overrideFind, factQueries }
}

describe('MarketMemoryService — #4183 : la lecture est PAR ESPACE', () => {
  it('lit les décisions humaines sous l’espace APPELANT seulement — jamais celles d’un autre', async () => {
    const { service, overrideFind } = await buildService()

    // L'espace A cherche : son compte n'a AUCUNE décision, B en a une sur le sien.
    const readA = await service.searchByFilters(
      { technology: 'java' },
      { workspaceId: WS_A, portfolio: [{ ref: ACC_A, name: 'Thales SA' }] },
    )

    expect(overrideFind.mock.calls.every(([query]) => query.where.workspaceId === WS_A)).toBe(true)
    expect(overrideFind).not.toHaveBeenCalledWith({ where: { workspaceId: WS_B } })
    expect(readA.status).toBe('ok')
    if (readA.status !== 'ok') return
    // Rien du côté de B ne remonte : ni lien vers son compte, ni son identifiant d'espace.
    expect(JSON.stringify(readA)).not.toContain(ACC_B)
    expect(JSON.stringify(readA)).not.toContain(WS_B)
  })

  it('sait dire NON : sans espace appelant, AUCUNE lecture par espace ne part', async () => {
    const { service, overrideFind, factQueries } = await buildService()

    await service.searchByFilters({ technology: 'java' }, { portfolio: [{ ref: ACC_A, name: 'Thales SA' }] })

    expect(overrideFind).not.toHaveBeenCalled()
    expect(factQueries).toHaveLength(0)
  })

  it('les faits datés sont lus avec l’espace appelant LIÉ au côté « mine », et il est le seul à l’être', async () => {
    const { service, factQueries } = await buildService()
    // Un compte A rapproché par domaine, pour que la lecture datée ait lieu.
    await service.searchByFilters(
      { technology: 'java' },
      { workspaceId: WS_A, portfolio: [{ ref: ACC_A, name: 'Thales', website: 'https://www.thalesgroup.com' }] },
    )

    expect(factQueries.some(q => q.sql.includes('access_facts'))).toBe(true)
    for (const { sql, params } of factQueries) {
      expect(params).not.toContain(WS_B)
      if (sql.includes('access_facts')) {
        expect(sql).toContain('mine.workspace_id = $2')
        expect(params[1]).toBe(WS_A)
      }
    }
  })
})

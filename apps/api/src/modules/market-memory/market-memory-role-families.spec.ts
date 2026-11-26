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
 * #2127.30 — `roleFamiliesManyFor` : les familles de rôles recrutées, de
 * PLUSIEURS entreprises à la fois — sert la raison « métiers recrutés en
 * commun » de la carte « comptes similaires » du dossier (Comparer avec
 * `observedStacksFor`, le patron déjà écrit pour la même carte, #1632.5).
 *
 * Ce que la suite tient :
 *  · `null` ≠ `[]` — « pas couverte » et « couverte, sans famille nommée » ;
 *  · le MÊME seuil que partout (`MARKET_MEMORY_MIN_PATHS`) ;
 *  · le seau résiduel (« Autre ») ne traverse jamais cette lecture ;
 *  · une panne rend `unavailable`, jamais des listes vides.
 */

type Row = Record<string, unknown>

function signalRow(overrides: Row = {}): Row {
  return {
    companyKey: 'thales',
    companyName: 'Thales',
    matchKey: 'thales',
    websiteDomain: null,
    pathsTotal: 41,
    roleFamilies: [],
    ...overrides,
  }
}

async function buildService(options: { signals?: Row[] } = {}) {
  const signalsRepo = {
    find: jest.fn().mockResolvedValue(options.signals ?? []),
  }

  const moduleRef = await Test.createTestingModule({
    providers: [
      MarketMemoryService,
      { provide: getRepositoryToken(MarketCompanySignalEntity), useValue: signalsRepo },
      { provide: getRepositoryToken(MarketEsnClientEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      { provide: getRepositoryToken(MarketCompanyStackEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      { provide: getRepositoryToken(MarketExEsnAtClientEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      { provide: getRepositoryToken(MarketCompanyAliasEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      {
        provide: getRepositoryToken(MarketCompanyResolutionOverrideEntity),
        useValue: { find: jest.fn().mockResolvedValue([]) },
      },
    ],
  }).compile()

  return { service: moduleRef.get(MarketMemoryService), signalsRepo }
}

const LOOKUP = { ref: 'a1', name: 'Thales', website: null }

describe('roleFamiliesManyFor', () => {
  it('rend les familles observées d’une entreprise couverte, le seau résiduel écarté', async () => {
    const { service } = await buildService({
      signals: [
        signalRow({
          roleFamilies: [
            { family: 'Autre', persons: 40 },
            { family: 'Data / IA', persons: 12 },
            { family: 'PMO', persons: 8 },
          ],
        }),
      ],
    })

    const read = await service.roleFamiliesManyFor([LOOKUP])

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.families.get('a1')).toEqual(['Data / IA', 'PMO'])
  })

  it('rend `null` — et jamais `[]` — pour une entreprise que le corpus ne connaît pas', async () => {
    const { service } = await buildService({ signals: [] })

    const read = await service.roleFamiliesManyFor([LOOKUP])

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.families.get('a1')).toBeNull()
  })

  it('applique le MÊME seuil que partout : sous trois parcours, aucune famille', async () => {
    const { service } = await buildService({
      signals: [signalRow({ pathsTotal: 2, roleFamilies: [{ family: 'Data / IA', persons: 5 }] })],
    })

    const read = await service.roleFamiliesManyFor([LOOKUP])

    if (read.status !== 'ok') throw new Error('lecture attendue OK')
    expect(read.families.get('a1')).toBeNull()
  })

  it('rend `[]` pour une entreprise COUVERTE sans famille nommée (que le seau résiduel)', async () => {
    const { service } = await buildService({
      signals: [signalRow({ roleFamilies: [{ family: 'Autre', persons: 40 }] })],
    })

    const read = await service.roleFamiliesManyFor([LOOKUP])

    if (read.status !== 'ok') throw new Error('lecture attendue OK')
    expect(read.families.get('a1')).toEqual([])
  })

  it('porte une entrée pour CHAQUE référence demandée, même inconnue', async () => {
    const { service } = await buildService({ signals: [] })

    const read = await service.roleFamiliesManyFor([LOOKUP, { ref: 'a2', name: 'Inconnue', website: null }])

    if (read.status !== 'ok') throw new Error('lecture attendue OK')
    expect([...read.families.keys()]).toEqual(['a1', 'a2'])
  })

  it('rend `unavailable` sur une panne — jamais des listes vides', async () => {
    const signalsRepo = {
      find: jest
        .fn()
        .mockResolvedValueOnce([signalRow()]) // candidatesByRef — la résolution réussit
        .mockRejectedValueOnce(new Error('base HS')), // la lecture des familles échoue
    }
    const moduleRef = await Test.createTestingModule({
      providers: [
        MarketMemoryService,
        { provide: getRepositoryToken(MarketCompanySignalEntity), useValue: signalsRepo },
        { provide: getRepositoryToken(MarketEsnClientEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(MarketCompanyStackEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
        {
          provide: getRepositoryToken(MarketExEsnAtClientEntity),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        { provide: getRepositoryToken(MarketCompanyAliasEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
        {
          provide: getRepositoryToken(MarketCompanyResolutionOverrideEntity),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile()
    const service = moduleRef.get(MarketMemoryService)
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)

    const read = await service.roleFamiliesManyFor([LOOKUP])

    expect(read.status).toBe('unavailable')
  })

  it('ne lit rien du tout pour une liste vide', async () => {
    const { service, signalsRepo } = await buildService({})

    const read = await service.roleFamiliesManyFor([])

    if (read.status !== 'ok') throw new Error('lecture attendue OK')
    expect(read.families.size).toBe(0)
    expect(signalsRepo.find).not.toHaveBeenCalled()
  })
})

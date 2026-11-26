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
 * #2165.30 — `esnObservedManyFor` : le recours externe OBSERVÉ de plusieurs
 * entreprises, en masse (même patron que `observedStacksFor`, #1632.5).
 *
 * Ce que la suite tient, et qui n'est pas décoratif :
 *  · `null` ≠ `false` — « on ne sait pas » (compte non résolu / non couvert)
 *    n'est JAMAIS « ce compte n'a pas de recours externe » (doctrine c65,
 *    GA-259) ;
 *  · le MÊME plancher que partout (`MARKET_MEMORY_MIN_PATHS` + le plancher par
 *    ESN de `esnObservedFrom`, celui du correctif du 10/09) ;
 *  · une panne rend `unavailable`, jamais une table vide.
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

async function buildService(options: { signals?: Row[]; esnClients?: Row[]; esnFind?: jest.Mock }) {
  const esnRepo = { find: options.esnFind ?? jest.fn().mockResolvedValue(options.esnClients ?? []) }

  const moduleRef = await Test.createTestingModule({
    providers: [
      MarketMemoryService,
      {
        provide: getRepositoryToken(MarketCompanySignalEntity),
        useValue: {
          findOne: jest.fn().mockResolvedValue(null),
          find: jest.fn().mockResolvedValue(options.signals ?? []),
        },
      },
      { provide: getRepositoryToken(MarketEsnClientEntity), useValue: esnRepo },
      { provide: getRepositoryToken(MarketCompanyStackEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      { provide: getRepositoryToken(MarketExEsnAtClientEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      { provide: getRepositoryToken(MarketCompanyAliasEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      {
        provide: getRepositoryToken(MarketCompanyResolutionOverrideEntity),
        useValue: { find: jest.fn().mockResolvedValue([]) },
      },
    ],
  }).compile()

  return { service: moduleRef.get(MarketMemoryService), esnRepo }
}

const LOOKUP = { ref: 'a1', name: 'Thales', website: null }

describe('esnObservedManyFor', () => {
  it('rend `true` pour une entreprise couverte avec au moins une ESN observée au-dessus du plancher', async () => {
    const { service } = await buildService({
      signals: [signalRow()],
      esnClients: [{ clientKey: 'thales', esnName: 'Keyrus', persons: 5 }],
    })

    const read = await service.esnObservedManyFor([LOOKUP])

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.observed.get('a1')).toBe(true)
  })

  it('rend `null` — jamais `false` — pour une entreprise que le corpus ne connaît pas', async () => {
    const { service } = await buildService({ signals: [] })

    const read = await service.esnObservedManyFor([LOOKUP])

    if (read.status !== 'ok') throw new Error('lecture attendue OK')
    // `null` : on ne sait pas. `false` dirait « on a vérifié, aucun recours » —
    // c'est exactement ce que la doctrine c65 interdit d'affirmer.
    expect(read.observed.get('a1')).toBeNull()
  })

  it('rend `false` pour une entreprise COUVERTE dont aucune ESN ne franchit le plancher', async () => {
    const { service } = await buildService({ signals: [signalRow()], esnClients: [] })

    const read = await service.esnObservedManyFor([LOOKUP])

    if (read.status !== 'ok') throw new Error('lecture attendue OK')
    // Couverte, donc on a regardé : `false` est une mesure, pas un aveu.
    expect(read.observed.get('a1')).toBe(false)
  })

  it('applique le MÊME seuil que partout : sous trois parcours, aucune couverture', async () => {
    const { service } = await buildService({
      signals: [signalRow({ pathsTotal: 2 })],
      esnClients: [{ clientKey: 'thales', esnName: 'Keyrus', persons: 5 }],
    })

    const read = await service.esnObservedManyFor([LOOKUP])

    if (read.status !== 'ok') throw new Error('lecture attendue OK')
    expect(read.observed.get('a1')).toBeNull()
  })

  it('applique le plancher PAR ESN (#1624, renversé #4016 L10) : une ESN à 1 parcours compte, une à 0 non', async () => {
    const { service } = await buildService({
      signals: [signalRow()],
      esnClients: [{ clientKey: 'thales', esnName: 'Keyrus', persons: 1 }],
    })

    const read = await service.esnObservedManyFor([LOOKUP])

    if (read.status !== 'ok') throw new Error('lecture attendue OK')
    expect(read.observed.get('a1')).toBe(true)

    const empty = await (
      await buildService({
        signals: [signalRow()],
        esnClients: [{ clientKey: 'thales', esnName: 'Keyrus', persons: 0 }],
      })
    ).service.esnObservedManyFor([LOOKUP])
    if (empty.status !== 'ok') throw new Error('lecture attendue OK')
    expect(empty.observed.get('a1')).toBe(false)
  })

  it('porte une entrée pour CHAQUE référence demandée, même inconnue', async () => {
    const { service } = await buildService({ signals: [] })

    const read = await service.esnObservedManyFor([LOOKUP, { ref: 'a2', name: 'Inconnue', website: null }])

    if (read.status !== 'ok') throw new Error('lecture attendue OK')
    expect([...read.observed.keys()]).toEqual(['a1', 'a2'])
  })

  it('rend `unavailable` sur une panne — jamais une table vide', async () => {
    const { service } = await buildService({
      signals: [signalRow()],
      esnFind: jest.fn().mockRejectedValue(new Error('base HS')),
    })
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)

    const read = await service.esnObservedManyFor([LOOKUP])

    expect(read.status).toBe('unavailable')
  })

  it('ne lit rien du tout pour une liste vide', async () => {
    const { service, esnRepo } = await buildService({})

    const read = await service.esnObservedManyFor([])

    if (read.status !== 'ok') throw new Error('lecture attendue OK')
    expect(read.observed.size).toBe(0)
    expect(esnRepo.find).not.toHaveBeenCalled()
  })
})

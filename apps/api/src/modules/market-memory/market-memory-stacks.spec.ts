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
 * #1632.5 — `observedStacksFor` : les piles observées de plusieurs entreprises,
 * plus la mesure d'ubiquité sans laquelle aucune techno ne peut être déclarée
 * discriminante.
 *
 * Ce que la suite tient, et qui n'est pas décoratif :
 *  · `null` ≠ `[]` — « on ne sait pas » et « on sait qu'il n'y a rien » ;
 *  · le MÊME seuil que partout (`MARKET_MEMORY_MIN_PATHS`) ;
 *  · une panne rend `unavailable`, jamais des piles vides ;
 *  · la table des fréquences est mise en cache, donc la requête groupée ne part
 *    pas à chaque ouverture d'écran.
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

function stackQueryBuilder(frequency: { techno: string; companies: string }[], distinctCompanies: string) {
  const builder = {
    select: jest.fn(() => builder),
    addSelect: jest.fn(() => builder),
    groupBy: jest.fn(() => builder),
    getRawMany: jest.fn().mockResolvedValue(frequency),
    getRawOne: jest.fn().mockResolvedValue({ companies: distinctCompanies }),
  }
  return builder
}

async function buildService(options: {
  signals?: Row[]
  stacks?: Row[]
  stacksFind?: jest.Mock
  frequency?: { techno: string; companies: string }[]
  distinctCompanies?: string
}) {
  const createQueryBuilder = jest.fn(() =>
    stackQueryBuilder(options.frequency ?? [{ techno: 'java', companies: '20' }], options.distinctCompanies ?? '100'),
  )
  const stacksRepo = {
    find: options.stacksFind ?? jest.fn().mockResolvedValue(options.stacks ?? []),
    createQueryBuilder,
  }

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
      { provide: getRepositoryToken(MarketEsnClientEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      { provide: getRepositoryToken(MarketCompanyStackEntity), useValue: stacksRepo },
      { provide: getRepositoryToken(MarketExEsnAtClientEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      // #1756 — la table d'alias, VIDE : cette suite ne parle pas d'alias, mais
      // le service l'injecte désormais, et une dépendance manquante ferait
      // échouer la CONSTRUCTION du module de test — pas ses assertions. Vide
      // est aussi l'état de production, donc la suite continue de mesurer le
      // chemin sans alias, qui est celui qu'elle décrit.
      { provide: getRepositoryToken(MarketCompanyAliasEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      // #1617.4 — aucune correction humaine ici : vide, la table laisse le
      // classement byte-identique au chemin d'avant le lot.
      {
        provide: getRepositoryToken(MarketCompanyResolutionOverrideEntity),
        useValue: { find: jest.fn().mockResolvedValue([]) },
      },
    ],
  }).compile()

  return { service: moduleRef.get(MarketMemoryService), stacksRepo, createQueryBuilder }
}

const LOOKUP = { ref: 'a1', name: 'Thales', website: null }

describe('observedStacksFor', () => {
  it('rend la pile observée d’une entreprise couverte, la plus observée en tête', async () => {
    const { service } = await buildService({
      signals: [signalRow()],
      stacks: [
        { companyKey: 'thales', techno: 'java', persons: 30 },
        { companyKey: 'thales', techno: 'c++', persons: 12 },
      ],
    })

    const read = await service.observedStacksFor([LOOKUP])

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.stacks.get('a1')).toEqual(['java', 'c++'])
    expect(read.corpusCompanies).toBe(100)
    expect(read.technoFrequency.get('java')).toBe(20)
  })

  it('rend `null` — et jamais `[]` — pour une entreprise que le corpus ne connaît pas', async () => {
    const { service } = await buildService({ signals: [] })

    const read = await service.observedStacksFor([LOOKUP])

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    // `null` : on ne sait pas. `[]` dirait « on a regardé, elle n'a rien ».
    expect(read.stacks.get('a1')).toBeNull()
  })

  it('applique le MÊME seuil que partout : sous trois parcours, aucune pile', async () => {
    const { service } = await buildService({
      signals: [signalRow({ pathsTotal: 2 })],
      stacks: [{ companyKey: 'thales', techno: 'java', persons: 30 }],
    })

    const read = await service.observedStacksFor([LOOKUP])

    if (read.status !== 'ok') throw new Error('lecture attendue OK')
    expect(read.stacks.get('a1')).toBeNull()
  })

  it('rend `[]` pour une entreprise COUVERTE dont aucune techno n’est observée', async () => {
    const { service } = await buildService({ signals: [signalRow()], stacks: [] })

    const read = await service.observedStacksFor([LOOKUP])

    if (read.status !== 'ok') throw new Error('lecture attendue OK')
    // Couverte, donc on a regardé : la liste vide est une mesure, pas un aveu.
    expect(read.stacks.get('a1')).toEqual([])
  })

  it('porte une entrée pour CHAQUE référence demandée, même inconnue', async () => {
    const { service } = await buildService({ signals: [] })

    const read = await service.observedStacksFor([LOOKUP, { ref: 'a2', name: 'Inconnue', website: null }])

    if (read.status !== 'ok') throw new Error('lecture attendue OK')
    expect([...read.stacks.keys()]).toEqual(['a1', 'a2'])
  })

  it('rend `unavailable` sur une panne — jamais des piles vides', async () => {
    const { service } = await buildService({ stacksFind: jest.fn().mockRejectedValue(new Error('base HS')) })
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)

    const read = await service.observedStacksFor([{ ...LOOKUP }])

    // Le rapprochement réussit (les signaux répondent), c'est la lecture des
    // piles qui tombe : la panne doit remonter, pas se taire.
    const withSignals = await buildService({
      signals: [signalRow()],
      stacksFind: jest.fn().mockRejectedValue(new Error('base HS')),
    })
    jest.spyOn(withSignals.service['logger'], 'error').mockImplementation(() => undefined)
    expect((await withSignals.service.observedStacksFor([LOOKUP])).status).toBe('unavailable')
    expect(read.status).toBe('ok')
  })

  it('ne lit rien du tout pour une liste vide', async () => {
    const { service, stacksRepo, createQueryBuilder } = await buildService({})

    const read = await service.observedStacksFor([])

    if (read.status !== 'ok') throw new Error('lecture attendue OK')
    expect(read.stacks.size).toBe(0)
    expect(stacksRepo.find).not.toHaveBeenCalled()
    expect(createQueryBuilder).not.toHaveBeenCalled()
  })

  it('normalise la casse des technos dans la table des fréquences', async () => {
    const { service } = await buildService({
      signals: [signalRow()],
      frequency: [{ techno: 'Java', companies: '20' }],
    })

    const read = await service.observedStacksFor([LOOKUP])

    if (read.status !== 'ok') throw new Error('lecture attendue OK')
    expect(read.technoFrequency.get('java')).toBe(20)
  })

  it('met la table des fréquences en cache — le GROUP BY ne part pas à chaque écran', async () => {
    const { service, createQueryBuilder } = await buildService({ signals: [signalRow()] })

    await service.observedStacksFor([LOOKUP])
    await service.observedStacksFor([LOOKUP])

    // Deux appels du constructeur par lecture (fréquences + dénominateur), une
    // seule fois : la seconde lecture sert le cache.
    expect(createQueryBuilder).toHaveBeenCalledTimes(2)
  })
})

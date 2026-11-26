import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { TECHNO_PREVALENCE_MIN_DISTINCT_TECHNOS } from '@bellum/contracts'
import { MarketCompanyAliasEntity } from '../../database/entities/market-company-alias.entity'
import { MarketCompanyResolutionOverrideEntity } from '../../database/entities/market-company-resolution-override.entity'
import { MarketCompanySignalEntity } from '../../database/entities/market-company-signal.entity'
import { MarketCompanyStackEntity } from '../../database/entities/market-company-stack.entity'
import { MarketEsnClientEntity } from '../../database/entities/market-esn-client.entity'
import { MarketExEsnAtClientEntity } from '../../database/entities/market-ex-esn-at-client.entity'
import { MarketMemoryService } from './market-memory.service'

/**
 * `technoPrevalenceFor` : le palier de prévalence de technologies SAISIES,
 * mesuré sur la distribution du corpus (les deux bornes sont des quantiles,
 * jamais un seuil écrit à la main).
 *
 * Ce que la suite tient :
 *  · la façade ne rend JAMAIS de fréquence brute — un palier, ou rien ;
 *  · une technologie inconnue du corpus n'a PAS de palier (« inconnu » n'est
 *    pas « rare ») ;
 *  · un corpus trop étroit ne produit AUCUN palier, jamais un palier par défaut ;
 *  · une panne rend `unavailable`, jamais une table de paliers vide ;
 *  · une demande vide ne part pas en base.
 */

type FrequencyRow = { techno: string; companies: string }

/** Une distribution étalée : `count` technologies, une entreprise de plus à chaque fois. */
function spreadFrequency(count = TECHNO_PREVALENCE_MIN_DISTINCT_TECHNOS * 3): FrequencyRow[] {
  return Array.from({ length: count }, (_unused, index) => ({
    techno: `techno-${index + 1}`,
    companies: String(index + 1),
  }))
}

function stackQueryBuilder(frequency: FrequencyRow[], distinctCompanies: string) {
  const builder = {
    select: jest.fn(() => builder),
    addSelect: jest.fn(() => builder),
    groupBy: jest.fn(() => builder),
    getRawMany: jest.fn().mockResolvedValue(frequency),
    getRawOne: jest.fn().mockResolvedValue({ companies: distinctCompanies }),
  }
  return builder
}

async function buildService(options: { frequency?: FrequencyRow[]; createQueryBuilder?: jest.Mock } = {}) {
  const createQueryBuilder =
    options.createQueryBuilder ?? jest.fn(() => stackQueryBuilder(options.frequency ?? spreadFrequency(), '500'))
  const stacksRepo = { find: jest.fn().mockResolvedValue([]), createQueryBuilder }

  const moduleRef = await Test.createTestingModule({
    providers: [
      MarketMemoryService,
      {
        provide: getRepositoryToken(MarketCompanySignalEntity),
        useValue: { findOne: jest.fn().mockResolvedValue(null), find: jest.fn().mockResolvedValue([]) },
      },
      { provide: getRepositoryToken(MarketEsnClientEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      { provide: getRepositoryToken(MarketCompanyStackEntity), useValue: stacksRepo },
      { provide: getRepositoryToken(MarketExEsnAtClientEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      { provide: getRepositoryToken(MarketCompanyAliasEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      // #1617.4 — aucune correction humaine ici : vide, la table laisse le
      // classement byte-identique au chemin d'avant le lot.
      {
        provide: getRepositoryToken(MarketCompanyResolutionOverrideEntity),
        useValue: { find: jest.fn().mockResolvedValue([]) },
      },
    ],
  }).compile()

  return { service: moduleRef.get(MarketMemoryService), createQueryBuilder }
}

describe('technoPrevalenceFor', () => {
  it('rend le palier de chaque technologie mesurée, sur les quantiles du corpus', async () => {
    const { service } = await buildService()

    const read = await service.technoPrevalenceFor(['techno-5', 'techno-45', 'techno-88'])

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.tiers.get('techno-5')).toBe('rare')
    expect(read.tiers.get('techno-45')).toBe('specialisee')
    expect(read.tiers.get('techno-88')).toBe('courante')
  })

  it('rapproche en ignorant la casse — le corpus est normalisé, la saisie non', async () => {
    const { service } = await buildService()

    const read = await service.technoPrevalenceFor(['  Techno-5 '])

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    // La clé rendue est la chaîne DEMANDÉE : l'appelant ne refait pas la
    // normalisation, sans quoi deux replis divergeraient.
    expect(read.tiers.get('  Techno-5 ')).toBe('rare')
  })

  it('une technologie INCONNUE du corpus n’a pas de palier — « inconnu » n’est pas « rare »', async () => {
    const { service } = await buildService()

    const read = await service.technoPrevalenceFor(['Cobol'])

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.tiers.has('Cobol')).toBe(false)
    expect(read.tiers.size).toBe(0)
  })

  it('un corpus trop étroit ne produit AUCUN palier, jamais un palier par défaut', async () => {
    const { service } = await buildService({ frequency: spreadFrequency(TECHNO_PREVALENCE_MIN_DISTINCT_TECHNOS - 1) })

    const read = await service.technoPrevalenceFor(['techno-5'])

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.tiers.size).toBe(0)
  })

  it('une demande VIDE ne part jamais en base', async () => {
    const { service, createQueryBuilder } = await buildService()

    const read = await service.technoPrevalenceFor([])

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.tiers.size).toBe(0)
    expect(createQueryBuilder).not.toHaveBeenCalled()
  })

  it('une panne de lecture rend `unavailable`, jamais une table de paliers vide', async () => {
    const createQueryBuilder = jest.fn(() => {
      throw new Error('connexion perdue')
    })
    const { service } = await buildService({ createQueryBuilder })

    const read = await service.technoPrevalenceFor(['techno-5'])

    expect(read.status).toBe('unavailable')
    if (read.status !== 'unavailable') return
    expect(read.reason).toBe('read_failed')
  })

  it('ne rend AUCUNE fréquence brute — un palier, ou rien', async () => {
    const { service } = await buildService()

    const read = await service.technoPrevalenceFor(['techno-5'])

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    for (const tier of read.tiers.values()) expect(typeof tier).toBe('string')
    expect(Object.keys(read)).toEqual(['status', 'tiers'])
  })
})

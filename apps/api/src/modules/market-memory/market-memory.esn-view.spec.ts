import { MARKET_ESN_VIEW_MAX_ITEMS, MARKET_MEMORY_MIN_PATHS } from '@bellum/contracts'
import { Logger } from '@nestjs/common'
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
 * `esnViewFor` — ce que la mémoire observe d'une entreprise EN TANT QUE société
 * de services (#1636).
 *
 * La direction de lecture est neuve : `market_ex_esn_at_client` n'était
 * interrogée que par `client_key` (« quels anciens d'ESN sont chez ce client
 * ? »). Ici on entre par `esn_origin_key` (« où sont les anciens de CETTE
 * société de services ? »), et c'est la seule chose du corpus qui réponde à
 * « écosystèmes de destination » sans l'inventer.
 */

type Row = Record<string, unknown>

function signalRow(overrides: Row = {}): Row {
  return {
    companyKey: 'alten',
    companyName: 'ALTEN',
    matchKey: 'alten',
    websiteDomain: null,
    pathsTotal: 14,
    roleFamilies: [
      { family: 'Autre', persons: 40 },
      { family: 'Développement', persons: 9 },
      { family: 'Data / IA', persons: 5 },
      { family: 'Chef de projet', persons: 4 },
      { family: 'Infra / Cloud', persons: 3 },
    ],
    ...overrides,
  }
}

function destinationRow(clientName: string, persons: number): Row {
  return { esnOriginKey: 'alten', clientName, persons }
}

async function buildService(repos: {
  signals?: Partial<Record<'findOne' | 'find', jest.Mock>>
  exEsn?: Partial<Record<'find', jest.Mock>>
}) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      MarketMemoryService,
      {
        provide: getRepositoryToken(MarketCompanySignalEntity),
        useValue: {
          findOne: jest.fn().mockResolvedValue(signalRow()),
          find: jest.fn().mockResolvedValue([signalRow()]),
          ...repos.signals,
        },
      },
      {
        provide: getRepositoryToken(MarketEsnClientEntity),
        useValue: { find: jest.fn().mockResolvedValue([]) },
      },
      {
        provide: getRepositoryToken(MarketCompanyStackEntity),
        useValue: { find: jest.fn().mockResolvedValue([]) },
      },
      {
        provide: getRepositoryToken(MarketExEsnAtClientEntity),
        useValue: { find: jest.fn().mockResolvedValue([]), ...repos.exEsn },
      },
      {
        provide: getRepositoryToken(MarketCompanyAliasEntity),
        useValue: { find: jest.fn().mockResolvedValue([]) },
      },
      // #1617.4 — aucune correction humaine ici : vide, la table laisse le
      // classement byte-identique au chemin d'avant le lot.
      {
        provide: getRepositoryToken(MarketCompanyResolutionOverrideEntity),
        useValue: { find: jest.fn().mockResolvedValue([]) },
      },
    ],
  }).compile()

  return moduleRef.get(MarketMemoryService)
}

describe('esnViewFor — ce que la mémoire observe de MON entreprise', () => {
  it('rend les parcours, les familles nommées et les destinations', async () => {
    const exEsnFind = jest
      .fn()
      .mockResolvedValue([destinationRow('ORANGE', 9), destinationRow('SNCF', 5), destinationRow('THALES', 4)])
    const service = await buildService({ exEsn: { find: exEsnFind } })

    const read = await service.esnViewFor({ ref: 'workspace-esn', name: 'ALTEN' })

    expect(read).toEqual({
      status: 'ok',
      view: {
        matchedCompanyName: 'ALTEN',
        matchedOn: 'name',
        pathsObserved: 14,
        roleFamilies: ['Développement', 'Data / IA', 'Chef de projet'],
        destinations: ['ORANGE', 'SNCF', 'THALES'],
      },
    })
  })

  it('entre par `esn_origin_key`, la direction que personne ne lisait', async () => {
    const exEsnFind = jest.fn().mockResolvedValue([])
    const service = await buildService({ exEsn: { find: exEsnFind } })

    await service.esnViewFor({ ref: 'workspace-esn', name: 'ALTEN' })

    expect(exEsnFind).toHaveBeenCalledWith({ where: { esnOriginKey: 'alten' }, order: { persons: 'DESC' } })
  })

  it('écarte le seau de résidu « Autre » — il est PREMIER partout et ne dit rien', async () => {
    const service = await buildService({})

    const read = await service.esnViewFor({ ref: 'workspace-esn', name: 'ALTEN' })

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.view.roleFamilies).not.toContain('Autre')
  })

  it('borne les deux listes, les plus fréquentes d’abord', async () => {
    const exEsnFind = jest
      .fn()
      .mockResolvedValue([
        destinationRow('PETIT', 3),
        destinationRow('GROS', 30),
        destinationRow('MOYEN', 12),
        destinationRow('AUTRE', 4),
      ])
    const service = await buildService({ exEsn: { find: exEsnFind } })

    const read = await service.esnViewFor({ ref: 'workspace-esn', name: 'ALTEN' })

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.view.destinations).toEqual(['GROS', 'MOYEN', 'AUTRE'])
    expect(read.view.destinations).toHaveLength(MARKET_ESN_VIEW_MAX_ITEMS)
    expect(read.view.roleFamilies).toHaveLength(MARKET_ESN_VIEW_MAX_ITEMS)
  })

  it('ne rend AUCUN comptage de personnes — le lecteur est leur employeur', async () => {
    const exEsnFind = jest.fn().mockResolvedValue([destinationRow('ORANGE', 9)])
    const service = await buildService({ exEsn: { find: exEsnFind } })

    const read = await service.esnViewFor({ ref: 'workspace-esn', name: 'ALTEN' })

    expect(JSON.stringify(read)).not.toContain('persons')
    expect(JSON.stringify(read)).not.toContain('9')
  })

  it('écarte une destination sous le seuil — une ligne à deux parcours n’est pas une observation', async () => {
    const exEsnFind = jest
      .fn()
      .mockResolvedValue([
        destinationRow('ORANGE', MARKET_MEMORY_MIN_PATHS),
        destinationRow('RARE', MARKET_MEMORY_MIN_PATHS - 1),
      ])
    const service = await buildService({ exEsn: { find: exEsnFind } })

    const read = await service.esnViewFor({ ref: 'workspace-esn', name: 'ALTEN' })

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.view.destinations).toEqual(['ORANGE'])
  })

  it('sous le seuil d’entreprise : « pas assez d’observations », jamais un zéro', async () => {
    // #1636 — sous le plancher : « pas suffisamment couverte », jamais un « 0 ».
    const service = await buildService({
      signals: { findOne: jest.fn().mockResolvedValue(signalRow({ pathsTotal: MARKET_MEMORY_MIN_PATHS - 1 })) },
    })

    const read = await service.esnViewFor({ ref: 'workspace-esn', name: 'ALTEN' })

    expect(read).toEqual({ status: 'insufficient' })
  })

  it('entreprise inconnue du corpus : « pas assez d’observations »', async () => {
    const service = await buildService({ signals: { find: jest.fn().mockResolvedValue([]) } })

    const read = await service.esnViewFor({ ref: 'workspace-esn', name: 'ALTEN' })

    expect(read).toEqual({ status: 'insufficient' })
  })

  it('deux homonymes : on ne tranche pas — « pas assez d’observations »', async () => {
    const service = await buildService({
      signals: {
        find: jest
          .fn()
          .mockResolvedValue([signalRow(), signalRow({ companyKey: 'alten2', companyName: 'ALTEN CONSEIL' })]),
      },
    })

    const read = await service.esnViewFor({ ref: 'workspace-esn', name: 'ALTEN' })

    expect(read).toEqual({ status: 'insufficient' })
  })

  it('une panne de lecture n’est JAMAIS « pas couverte »', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const service = await buildService({ exEsn: { find: jest.fn().mockRejectedValue(new Error('boom')) } })

    const read = await service.esnViewFor({ ref: 'workspace-esn', name: 'ALTEN' })

    expect(read).toEqual({ status: 'unavailable', reason: 'read_failed' })
    jest.restoreAllMocks()
  })

  it('un nom vide ne rapproche RIEN — jamais une entreprise au hasard', async () => {
    const find = jest.fn().mockResolvedValue([signalRow()])
    const service = await buildService({ signals: { find } })

    const read = await service.esnViewFor({ ref: 'workspace-esn', name: '   ' })

    expect(read).toEqual({ status: 'insufficient' })
    expect(find).not.toHaveBeenCalled()
  })
})

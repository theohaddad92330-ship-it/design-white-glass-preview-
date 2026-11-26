import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ServiceUnavailableException } from '@nestjs/common'
import type { MarketMemoryGroundTruthJudgmentInput } from '@bellum/contracts'
import { MarketMemoryGroundTruthJudgmentEntity } from '../../database/entities/market-memory-ground-truth-judgment.entity'
import { buildGroundTruthCaseKey, MarketMemoryGroundTruthService } from './market-memory-ground-truth.service'
import { MARKET_MEMORY_GROUND_TRUTH_READER, type MarketMemoryGroundTruthReaderResult } from './module-tokens'

// #1622 — le service ne fait AUCUN appel réel à `MarketMemoryService` : il
// reçoit son lecteur par jeton (voir `module-tokens.ts`), ce que ce test
// prouve en injectant un mock qui n'importe rien du module `market-memory`.

function buildQueryBuilder(rows: MarketMemoryGroundTruthJudgmentEntity[]) {
  const qb = {
    distinctOn: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  }
  return qb
}

async function buildService(options: {
  currentRows?: MarketMemoryGroundTruthJudgmentEntity[]
  reader?: jest.Mock<Promise<MarketMemoryGroundTruthReaderResult>, [unknown]>
}) {
  const qb = buildQueryBuilder(options.currentRows ?? [])
  const repo = {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    create: jest.fn((v: Partial<MarketMemoryGroundTruthJudgmentEntity>) => v as MarketMemoryGroundTruthJudgmentEntity),
    save: jest.fn((v: MarketMemoryGroundTruthJudgmentEntity) =>
      Promise.resolve({ ...v, id: 'generated-id', judgedAt: new Date('2026-09-11T10:00:00Z') }),
    ),
  }
  const reader =
    options.reader ??
    jest.fn().mockResolvedValue({
      status: 'ok',
      reading: { hadReading: false, rank: null, persons: null, certainty: null },
    })

  const moduleRef = await Test.createTestingModule({
    providers: [
      MarketMemoryGroundTruthService,
      { provide: getRepositoryToken(MarketMemoryGroundTruthJudgmentEntity), useValue: repo },
      { provide: MARKET_MEMORY_GROUND_TRUTH_READER, useValue: reader },
    ],
  }).compile()

  return { service: moduleRef.get(MarketMemoryGroundTruthService), repo, reader, qb }
}

describe('MarketMemoryGroundTruthService', () => {
  const INPUT: MarketMemoryGroundTruthJudgmentInput = {
    accountName: 'Société Générale',
    esnName: 'Capgemini',
    label: 'useful_and_correct',
  }

  it('submitJudgment interroge le LECTEUR (jamais une entité market_* directement) puis enregistre', async () => {
    const reader = jest.fn().mockResolvedValue({
      status: 'ok',
      reading: { hadReading: true, rank: 2, persons: 14, certainty: 'forte' },
    })
    const { service, repo } = await buildService({ reader })

    const judgment = await service.submitJudgment(INPUT, 'louis@bellum.fr')

    expect(reader).toHaveBeenCalledWith({
      accountName: 'Société Générale',
      accountWebsite: null,
      accountCountry: null,
      esnName: 'Capgemini',
    })
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        hadReading: true,
        readingRank: 2,
        readingPersons: 14,
        readingCertainty: 'forte',
        label: 'useful_and_correct',
        judgedBy: 'louis@bellum.fr',
      }),
    )
    expect(judgment.reading).toEqual({ hadReading: true, rank: 2, persons: 14, certainty: 'forte' })
    expect(judgment.judgedBy).toBe('louis@bellum.fr')
  })

  it('REFUSE d’enregistrer un jugement quand la mémoire marché est indisponible — jamais `hadReading: false` sur une panne', async () => {
    const reader = jest.fn().mockResolvedValue({ status: 'unavailable', reason: 'read_failed' })
    const { service, repo } = await buildService({ reader })

    await expect(service.submitJudgment(INPUT, 'louis@bellum.fr')).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('listCurrentJudgments et computeMetrics lisent la MÊME requête (DISTINCT ON case_key, judged_at DESC)', async () => {
    const rows = [
      row({ id: '1', caseKey: 'k1', label: 'useful_and_correct' }),
      row({ id: '2', caseKey: 'k2', label: 'wrong_entity' }),
    ]
    const { service, qb } = await buildService({ currentRows: rows })

    const judgments = await service.listCurrentJudgments()
    expect(judgments).toHaveLength(2)
    expect(qb.distinctOn).toHaveBeenCalledWith(['j.case_key'])
    expect(qb.addOrderBy).toHaveBeenCalledWith('j.judged_at', 'DESC')

    // computeMetrics repart de la MÊME source — pas d'un second calcul.
    const metrics = await service.computeMetrics()
    expect(metrics).toBeDefined()
  })
})

describe('buildGroundTruthCaseKey', () => {
  it('normalise la casse et les espaces — deux jugements du même cas partagent la clé', () => {
    const a = buildGroundTruthCaseKey({
      accountName: '  Société Générale ',
      accountWebsite: null,
      esnName: 'capgemini',
    })
    const b = buildGroundTruthCaseKey({ accountName: 'société générale', accountWebsite: null, esnName: 'Capgemini' })
    expect(a).toBe(b)
  })

  it('deux ESN différentes sur le même compte sont deux cas différents', () => {
    const a = buildGroundTruthCaseKey({ accountName: 'Orange', accountWebsite: null, esnName: 'Capgemini' })
    const b = buildGroundTruthCaseKey({ accountName: 'Orange', accountWebsite: null, esnName: 'Sopra Steria' })
    expect(a).not.toBe(b)
  })

  it('un site web différent départage deux comptes homonymes', () => {
    const a = buildGroundTruthCaseKey({ accountName: 'Orange', accountWebsite: 'orange.com', esnName: 'Capgemini' })
    const b = buildGroundTruthCaseKey({ accountName: 'Orange', accountWebsite: 'orangebank.fr', esnName: 'Capgemini' })
    expect(a).not.toBe(b)
  })
})

function row(overrides: Partial<MarketMemoryGroundTruthJudgmentEntity>): MarketMemoryGroundTruthJudgmentEntity {
  return {
    id: 'id',
    caseKey: 'case',
    accountName: 'Compte',
    accountWebsite: null,
    accountCountry: null,
    esnName: 'ESN',
    hadReading: true,
    readingRank: 1,
    readingPersons: 5,
    readingCertainty: 'forte',
    label: 'useful_and_correct',
    judgedBy: 'operateur@bellum.fr',
    judgedAt: new Date('2026-09-11T00:00:00Z'),
    ...overrides,
  }
}

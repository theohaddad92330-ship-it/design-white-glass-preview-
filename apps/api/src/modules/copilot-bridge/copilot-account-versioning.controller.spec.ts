import { success, failure } from '@bellum/utils'
import { CopilotAccountVersioningController } from './copilot-account-versioning.controller'
import { CopilotAccountVersioningDto } from './dto/copilot-bridge.dto'

const USER = '99999999-9999-4999-8999-999999999999'
const ACCOUNT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('CopilotAccountVersioningController (#3212.3/.4/.6, épopée #3235)', () => {
  it('revérifie l’ownership et rend null/null quand le compte n’appartient pas à cet utilisateur', async () => {
    const accounts = { findOne: jest.fn(async () => failure({ code: 'not_found', message: 'nope' })) }
    const runs = { listForAccount: jest.fn(), explainVerdictChange: jest.fn(), compareLastRuns: jest.fn() }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doubles de test
    const controller = new CopilotAccountVersioningController(accounts as any, runs as any)

    const result = await controller.versioning({ userId: USER, accountId: ACCOUNT })

    expect(accounts.findOne).toHaveBeenCalledWith(ACCOUNT, USER)
    expect(runs.listForAccount).not.toHaveBeenCalled()
    expect(result).toEqual({ versioning: null, verdictRevision: null, verdictComparison: null })
  })

  it('rend le versioning du run le plus récent et la révision de verdict, une fois l’ownership confirmée', async () => {
    const versioning = {
      analysis_version: 'abc123f',
      profile_version: 'esn:1/context:1',
      account_context_version: null,
      dataforge_version: null,
      market_memory_version: null,
      prompt_version: null,
      scoring_version: null,
      date: '2026-09-28T00:00:00.000Z',
      scope: 'france',
    }
    const revision = { previousVerdict: 'NO-GO', newVerdict: 'GO', changedAt: new Date('2026-09-28'), causes: ['x'] }
    const accounts = { findOne: jest.fn(async () => success({ id: ACCOUNT })) }
    const runs = {
      listForAccount: jest.fn(async () => [{ versioning }]),
      explainVerdictChange: jest.fn(async () => revision),
      compareLastRuns: jest.fn(async () => null),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doubles de test
    const controller = new CopilotAccountVersioningController(accounts as any, runs as any)

    const result = await controller.versioning({ userId: USER, accountId: ACCOUNT })

    expect(runs.listForAccount).toHaveBeenCalledWith(ACCOUNT, 1)
    expect(runs.explainVerdictChange).toHaveBeenCalledWith(ACCOUNT)
    expect(result).toEqual({ versioning, verdictRevision: revision, verdictComparison: null })
  })

  // #3235 — `dataforge_version` vient de la façade, pas d'un second chemin.
  it('pose dataforge_version lu via la façade AccountIntelligenceContextService', async () => {
    const versioning = {
      analysis_version: 'abc123f',
      profile_version: null,
      account_context_version: null,
      dataforge_version: null,
      market_memory_version: null,
      prompt_version: null,
      scoring_version: null,
      date: '2026-09-28T00:00:00.000Z',
      scope: 'france',
    }
    const accounts = { findOne: jest.fn(async () => success({ id: ACCOUNT, workspace_id: 'ws-1' })) }
    const runs = {
      listForAccount: jest.fn(async () => [{ versioning }]),
      explainVerdictChange: jest.fn(async () => null),
      compareLastRuns: jest.fn(async () => null),
    }
    const intelligence = { dataforgeVersionFor: jest.fn(async () => 'ORION_V12') }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doubles de test
    const controller = new CopilotAccountVersioningController(accounts as any, runs as any, intelligence as any)

    const result = await controller.versioning({ userId: USER, accountId: ACCOUNT })

    expect(intelligence.dataforgeVersionFor).toHaveBeenCalledWith(ACCOUNT, 'ws-1')
    expect(result.versioning?.dataforge_version).toBe('ORION_V12')
  })

  it('rend versioning null quand le compte existe mais n’a encore aucun run', async () => {
    const accounts = { findOne: jest.fn(async () => success({ id: ACCOUNT })) }
    const runs = {
      listForAccount: jest.fn(async () => []),
      explainVerdictChange: jest.fn(async () => null),
      compareLastRuns: jest.fn(async () => null),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doubles de test
    const controller = new CopilotAccountVersioningController(accounts as any, runs as any)

    const result = await controller.versioning({ userId: USER, accountId: ACCOUNT })

    expect(result).toEqual({ versioning: null, verdictRevision: null, verdictComparison: null })
  })

  // #3235 (recette 13/10, Thales) — verdict identique : la comparaison est rendue, avec le verdict COURANT du dossier.
  it('rend la comparaison des deux dernières analyses, avec le verdict courant du dossier en rattrapage', async () => {
    const comparison = {
      status: 'unchanged',
      previousVerdict: 'GO',
      newVerdict: 'GO',
      previousAt: new Date('2026-09-10'),
      latestAt: new Date('2026-10-05'),
      unchangedSince: new Date('2026-09-10'),
      causes: [],
    }
    const accounts = {
      findOne: jest.fn(async () => success({ id: ACCOUNT, raw_analysis: { plan: { evaluation: { verdict: 'GO' } } } })),
    }
    const runs = {
      listForAccount: jest.fn(async () => []),
      explainVerdictChange: jest.fn(async () => null),
      compareLastRuns: jest.fn(async () => comparison),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doubles de test
    const controller = new CopilotAccountVersioningController(accounts as any, runs as any)

    const result = await controller.versioning({ userId: USER, accountId: ACCOUNT })

    expect(runs.compareLastRuns).toHaveBeenCalledWith(ACCOUNT, 'GO')
    expect(result.verdictComparison).toEqual(comparison)
  })

  it('.strict() refuse un champ glissé par l’appelant', () => {
    const schema = CopilotAccountVersioningDto.schema
    expect(schema.safeParse({ userId: USER, accountId: ACCOUNT }).success).toBe(true)
    expect(schema.safeParse({ userId: USER, accountId: ACCOUNT, workspaceId: 'x' }).success).toBe(false)
    expect(schema.safeParse({ userId: USER }).success).toBe(false)
  })
})

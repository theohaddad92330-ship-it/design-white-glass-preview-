import { createMockRepository } from '../../database/test-utils'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import type { PlanCatalogPort } from './plan-catalog.port'
import { FeatureAdoptionUsageService } from './feature-adoption-usage.service'

/** Route chaque requête SQL marquée (`-- q:xxx`) vers ses lignes semées — même
 *  idiome que `team-kpis.service.spec.ts`. */
function seededQuery(sql: string): unknown[] {
  if (sql.includes('q:eligible_by_plan')) {
    return [
      { plan: 'trial', count: 3 },
      { plan: 'growth', count: 50 },
    ]
  }
  if (sql.includes('q:active_crm_sync')) return [{ plan: 'growth', count: 12 }]
  if (sql.includes('q:active_public_api')) return []
  if (sql.includes('q:active_mcp_assistant')) return [{ plan: 'growth', count: 4 }]
  return []
}

function fakePlanCatalog(): PlanCatalogPort {
  return {
    all: jest.fn().mockResolvedValue([
      { key: 'trial', features: ['chat_ai'] },
      { key: 'growth', features: ['chat_ai', 'crm_sync', 'public_api', 'mcp_assistant'] },
    ]),
  } as unknown as PlanCatalogPort
}

describe('#1685 — FeatureAdoptionUsageService', () => {
  it('rend les 15 fonctions, avec éligibilité et usage par plan agrégés', async () => {
    const repo = createMockRepository<WorkspaceEntity>()
    repo.manager.query.mockImplementation((sql: string) => Promise.resolve(seededQuery(sql)))
    const service = new FeatureAdoptionUsageService(repo as never, fakePlanCatalog())

    const report = await service.report(90)

    expect(report.windowDays).toBe(90)
    expect(report.signals).toHaveLength(15)

    const crmSync = report.signals.find(s => s.feature === 'crm_sync')!
    expect(crmSync.eligibleWorkspaces).toBe(50)
    expect(crmSync.activeWorkspaces).toBe(12)

    const publicApi = report.signals.find(s => s.feature === 'public_api')!
    expect(publicApi.eligibleWorkspaces).toBe(50)
    expect(publicApi.activeWorkspaces).toBe(0)

    const mcp = report.signals.find(s => s.feature === 'mcp_assistant')!
    expect(mcp.activeWorkspaces).toBe(4)

    // Fonction sans palier ouvrant : éligible = 0, jamais une exception.
    const chatAi = report.signals.find(s => s.feature === 'chat_ai')!
    expect(chatAi.eligibleWorkspaces).toBe(53) // trial(3) + growth(50) ouvrent chat_ai
  })

  it('une fonction non branchée (exports, discover) rend activeWorkspaces à null, jamais 0', async () => {
    const repo = createMockRepository<WorkspaceEntity>()
    repo.manager.query.mockImplementation((sql: string) => Promise.resolve(seededQuery(sql)))
    const service = new FeatureAdoptionUsageService(repo as never, fakePlanCatalog())

    const report = await service.report(90)

    expect(report.signals.find(s => s.feature === 'exports')!.activeWorkspaces).toBeNull()
    expect(report.signals.find(s => s.feature === 'discover')!.activeWorkspaces).toBeNull()
  })

  it('sait dire NON — passer une fenêtre hors bornes est CLAMPÉE, jamais rejetée en NaN', async () => {
    const repo = createMockRepository<WorkspaceEntity>()
    repo.manager.query.mockImplementation((sql: string) => Promise.resolve(seededQuery(sql)))
    const service = new FeatureAdoptionUsageService(repo as never, fakePlanCatalog())

    const tropGrand = await service.report(10_000)
    expect(tropGrand.windowDays).toBe(365)

    const invalide = await service.report(Number.NaN)
    expect(invalide.windowDays).toBe(90)

    const negatif = await service.report(-5)
    expect(negatif.windowDays).toBe(1)
  })

  it('chaque requête d’usage passe bien la fenêtre en paramètre — pas une chaîne interpolée', async () => {
    const repo = createMockRepository<WorkspaceEntity>()
    repo.manager.query.mockImplementation((sql: string) => Promise.resolve(seededQuery(sql)))
    const service = new FeatureAdoptionUsageService(repo as never, fakePlanCatalog())

    await service.report(42)

    const windowedCalls = repo.manager.query.mock.calls.filter(([sql]) => (sql as string).includes('q:active_'))
    expect(windowedCalls.length).toBeGreaterThan(0)
    for (const [, params] of windowedCalls) {
      expect(params).toEqual([42])
    }
  })

  it('n’émet AUCUN identifiant d’espace : seules des requêtes GROUPÉES PAR PALIER sont exécutées', async () => {
    const repo = createMockRepository<WorkspaceEntity>()
    const calls: string[] = []
    repo.manager.query.mockImplementation((sql: string) => {
      calls.push(sql)
      return Promise.resolve(seededQuery(sql))
    })
    const service = new FeatureAdoptionUsageService(repo as never, fakePlanCatalog())

    await service.report(90)

    for (const sql of calls) {
      expect(sql).toContain('GROUP BY')
      expect(sql).not.toMatch(/SELECT\s+\*/i)
    }
  })

  it('#1954.7 — la base de connaissance ne compte que les documents de l’ESN, jamais une pièce jointe de fil', async () => {
    // Un document joint au chat (`scope: 'conversation'`) n'entre pas dans la
    // base de connaissance : un espace qui a seulement joint un CV à Laura n'a
    // pas « adopté » la base de connaissance.
    const repo = createMockRepository<WorkspaceEntity>()
    const calls: string[] = []
    repo.manager.query.mockImplementation((sql: string) => {
      calls.push(sql)
      return Promise.resolve(seededQuery(sql))
    })
    const service = new FeatureAdoptionUsageService(repo as never, fakePlanCatalog())

    await service.report(90)

    const knowledge = calls.find(sql => sql.includes('q:active_knowledge_base'))
    expect(knowledge).toBeDefined()
    expect(knowledge).toMatch(/t\.scope\s*=\s*'workspace'/)
  })
})

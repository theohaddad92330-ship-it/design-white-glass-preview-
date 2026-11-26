import type { Queue } from 'bullmq'
import type { DataSource } from 'typeorm'
import { METHOD_CORPUS_V1 } from '@bellum/contracts'
import { HttpError } from '@bellum/errors'
import type { IaClient, IaModelRoutingEntry, IaPromptRegistryEntry, IaRightsMatrixEntry } from '../ia/ia.client'
import { AdminOpsService } from './admin-ops.service'

/**
 * Wire an {@link AdminOpsService} onto in-memory mocks: `DataSource.query` is
 * routed by the SQL text (each aggregation carries a distinctive `GROUP BY` /
 * `FROM analysis_runs` marker) and the two BullMQ queues expose a mocked
 * `getJobCounts`. This mirrors how the real service is fed — a raw DataSource +
 * the `analysis` / `mailer` queues.
 */
function makeService(opts: {
  query?: jest.Mock
  analysisCounts?: Record<string, number>
  mailerCounts?: Record<string, number>
  migrations?: { name: string }[]
  modelRoutingPolicy?: jest.Mock
  declareModelRoutingEval?: jest.Mock
  promptRegistry?: jest.Mock
  promptRegistryDiff?: jest.Mock
  rightsMatrix?: jest.Mock
  methodCorpusGovernance?: jest.Mock
}) {
  const query = opts.query ?? jest.fn().mockResolvedValue([])
  const dataSource = { query, migrations: opts.migrations ?? [] } as unknown as DataSource
  const analysisQueue = {
    getJobCounts: jest.fn().mockResolvedValue(opts.analysisCounts ?? {}),
  } as unknown as Queue
  const mailerQueue = {
    getJobCounts: jest.fn().mockResolvedValue(opts.mailerCounts ?? {}),
  } as unknown as Queue
  const ia = {
    modelRoutingPolicy: opts.modelRoutingPolicy ?? jest.fn().mockResolvedValue({ routes: [] }),
    declareModelRoutingEval: opts.declareModelRoutingEval ?? jest.fn().mockResolvedValue({ ok: true }),
    promptRegistry: opts.promptRegistry ?? jest.fn().mockResolvedValue({ prompts: [] }),
    promptRegistryDiff: opts.promptRegistryDiff ?? jest.fn().mockResolvedValue({ diff: '', rollbackCommand: [] }),
    rightsMatrix: opts.rightsMatrix ?? jest.fn().mockResolvedValue({ tools: [] }),
    methodCorpusGovernance: opts.methodCorpusGovernance ?? jest.fn().mockResolvedValue({ wiredRuleIds: [] }),
  } as unknown as IaClient
  const service = new AdminOpsService(dataSource, analysisQueue, mailerQueue, ia)
  return { service, query, analysisQueue, mailerQueue, ia }
}

/** Route the three usage queries by their SQL marker. */
function usageQueryRouter(): jest.Mock {
  return jest.fn((sql: string) => {
    if (/GROUP BY a\.user_id/.test(sql)) {
      return Promise.resolve([
        {
          userId: 'u1',
          email: 'ann@acme.io',
          firstName: 'Ann',
          lastName: 'Lee',
          totalAnalyses: '3',
          totalCost: '1.5',
          avgCost: '0.5',
          last30dCost: '1.0',
        },
      ])
    }
    if (/GROUP BY a\.workspace_id/.test(sql)) {
      return Promise.resolve([
        {
          workspaceId: 'w1',
          workspaceName: 'Acme ESN',
          totalAnalyses: '5',
          totalCost: '2.5',
          avgCost: '0.5',
          last30dCost: '2.0',
        },
      ])
    }
    // totals (no GROUP BY)
    return Promise.resolve([{ totalAnalyses: '8', totalCost: '4', avgCost: '0.5', last30dCost: '3' }])
  })
}

describe('AdminOpsService', () => {
  describe('getUsage', () => {
    it('aggregates cost/usage per user, per workspace and overall', async () => {
      const { service } = makeService({ query: usageQueryRouter() })
      const report = await service.getUsage()

      expect(report.totals).toEqual({
        totalAnalyses: 8,
        totalCost: 4,
        avgCost: 0.5,
        last30dCost: 3,
        unmeasuredAnalyses: 0,
      })
      expect(report.byUser).toHaveLength(1)
      expect(report.byWorkspace).toHaveLength(1)
    })

    it('coerces Postgres numeric strings to numbers and builds the full name', async () => {
      const { service } = makeService({ query: usageQueryRouter() })
      const report = await service.getUsage()

      const user = report.byUser[0]!
      expect(user.userId).toBe('u1')
      expect(user.email).toBe('ann@acme.io')
      expect(user.fullName).toBe('Ann Lee')
      // Strings off the pg driver became real numbers.
      expect(user.totalCost).toBe(1.5)
      expect(typeof user.totalCost).toBe('number')
      expect(user.totalAnalyses).toBe(3)
      expect(user.last30dCost).toBe(1)

      const ws = report.byWorkspace[0]!
      expect(ws.workspaceId).toBe('w1')
      expect(ws.workspaceName).toBe('Acme ESN')
      expect(ws.totalCost).toBe(2.5)
      expect(ws.totalAnalyses).toBe(5)
    })

    it('scopes the per-user aggregation on accounts (cross-tenant) and caps the top-N', async () => {
      const query = usageQueryRouter()
      const { service } = makeService({ query })
      await service.getUsage()

      const userCall = query.mock.calls.find(([sql]: [string]) => /GROUP BY a\.user_id/.test(sql))!
      expect(userCall[0]).toMatch(/FROM accounts/)
      expect(userCall[0]).toMatch(/SUM\(a\.api_cost_euros\)/)
      // A LIMIT is passed as a bound param so the endpoint never dumps every row.
      expect(Array.isArray(userCall[1])).toBe(true)
      expect(typeof userCall[1][0]).toBe('number')
    })

    it('tolerates empty result sets (no analyses yet) without throwing', async () => {
      const { service } = makeService({ query: jest.fn().mockResolvedValue([]) })
      const report = await service.getUsage()
      expect(report.byUser).toEqual([])
      expect(report.byWorkspace).toEqual([])
      // Aucune ligne du tout : le coût moyen n'est pas « 0 $ », il est INCONNU.
      expect(report.totals).toEqual({
        totalAnalyses: 0,
        totalCost: 0,
        avgCost: null,
        last30dCost: 0,
        unmeasuredAnalyses: 0,
      })
    })
  })

  /**
   * « Le zéro est un trou, pas un fait » — le modèle d'unit-economics du 18/08
   * l'écrit à propos de quatre postes de coût fixe sans facture. La même erreur
   * vivait ici : `COALESCE(AVG(api_cost_euros), 0)` rendait **0,0000 $ de coût
   * moyen par analyse** pour un opérateur dont aucune analyse n'a jamais été
   * tarifée. Un total partiel affiché comme un total complet est plus dangereux
   * qu'une absence : celui qui le lit décide dessus, et l'erreur va toujours
   * dans le sens rassurant.
   */
  describe('un coût jamais mesuré n’est pas un coût de zéro', () => {
    it('rend `avgCost: null` quand la moyenne SQL est NULL', async () => {
      const query = jest
        .fn()
        .mockResolvedValue([
          { totalAnalyses: '4', totalCost: '0', avgCost: null, last30dCost: '0', unmeasuredAnalyses: '4' },
        ])
      const { service } = makeService({ query })
      const report = await service.getUsage()

      expect(report.totals.avgCost).toBeNull()
      expect(report.totals.unmeasuredAnalyses).toBe(4)
    })

    it('compte, par utilisateur et par espace, les analyses dont le coût est inconnu', async () => {
      const query = jest.fn((sql: string) => {
        if (/GROUP BY a\.user_id/.test(sql)) {
          return Promise.resolve([
            {
              userId: 'u1',
              totalAnalyses: '3',
              totalCost: '1.5',
              avgCost: '0.75',
              last30dCost: '1',
              unmeasuredAnalyses: '1',
            },
          ])
        }
        if (/GROUP BY a\.workspace_id/.test(sql)) {
          return Promise.resolve([
            {
              workspaceId: 'w1',
              totalAnalyses: '5',
              totalCost: '0',
              avgCost: null,
              last30dCost: '0',
              unmeasuredAnalyses: '5',
            },
          ])
        }
        return Promise.resolve([])
      })
      const { service } = makeService({ query })
      const report = await service.getUsage()

      expect(report.byUser[0]!.unmeasuredAnalyses).toBe(1)
      // Cinq analyses, aucune tarifée : le total est 0 $ ET il le dit.
      expect(report.byWorkspace[0]!.unmeasuredAnalyses).toBe(5)
      expect(report.byWorkspace[0]!.avgCost).toBeNull()
    })

    it('les TROIS requêtes demandent ce compte à SQL — pas seulement une', async () => {
      // Une garde qui ne regarde qu'une requête sur trois est borgne : c'est
      // exactement ce qui s'était passé ici, où la règle était déjà tenue par
      // `provider_costs` et par personne d'autre.
      const query = usageQueryRouter()
      const { service } = makeService({ query })
      await service.getUsage()

      const sqls = query.mock.calls.map(([sql]: [string]) => sql)
      expect(sqls).toHaveLength(3)
      for (const sql of sqls) {
        expect(sql).toMatch(/COUNT\(\*\) FILTER \(WHERE [\w.]*api_cost_euros IS NULL\)/)
        // Et plus aucun `COALESCE(AVG(...), 0)` : une moyenne sur rien n'est pas 0.
        expect(sql).not.toMatch(/COALESCE\(AVG\(/)
      }
    })
  })

  describe('getHealth', () => {
    const failureRouter = (total: number, failed: number): jest.Mock =>
      jest.fn((sql: string) => {
        if (/analysis_runs/.test(sql)) return Promise.resolve([{ total: String(total), failed: String(failed) }])
        return Promise.resolve([])
      })

    it('reports both queue depths from getJobCounts', async () => {
      const { service, analysisQueue, mailerQueue } = makeService({
        query: failureRouter(10, 1),
        analysisCounts: { waiting: 4, active: 2, completed: 100, failed: 3, delayed: 1, paused: 0 },
        mailerCounts: { waiting: 0, active: 1, completed: 50, failed: 0, delayed: 0, paused: 0 },
      })
      const health = await service.getHealth()

      expect(analysisQueue.getJobCounts).toHaveBeenCalledTimes(1)
      expect(mailerQueue.getJobCounts).toHaveBeenCalledTimes(1)
      expect(health.queues.map(q => q.name)).toEqual(['analysis', 'mailer'])
      const analysis = health.queues.find(q => q.name === 'analysis')!
      expect(analysis.waiting).toBe(4)
      expect(analysis.failed).toBe(3)
    })

    it('computes the 24h failure rate from analysis_runs (error OR failed status)', async () => {
      const query = failureRouter(10, 2)
      const { service } = makeService({ query })
      const health = await service.getHealth()

      expect(health.failures).toEqual({ windowHours: 24, total: 10, failed: 2, failureRate: 0.2 })
      const [sql] = query.mock.calls.find(([s]: [string]) => /analysis_runs/.test(s))!
      expect(sql).toMatch(/24 hours/)
      expect(sql).toMatch(/error/)
      expect(sql).toMatch(/failed/)
    })

    it('supervision 30/09 — no run in 24h: failureRate is null, never 0', async () => {
      const { service } = makeService({ query: failureRouter(0, 0) })
      const health = await service.getHealth()
      expect(health.failures).toEqual({ windowHours: 24, total: 0, failed: 0, failureRate: null })
    })

    it('supervision 30/09 — absent queue counters are null, never 0', async () => {
      const { service } = makeService({ query: failureRouter(10, 1), analysisCounts: { waiting: 4 }, mailerCounts: {} })
      const health = await service.getHealth()
      const analysis = health.queues.find(q => q.name === 'analysis')!
      expect(analysis.waiting).toBe(4)
      expect(analysis.active).toBeNull()
      expect(analysis.failed).toBeNull()
      expect(health.queues.find(q => q.name === 'mailer')!.waiting).toBeNull()
    })

    it('is healthy on a low failure rate and small backlog', async () => {
      const { service } = makeService({
        query: failureRouter(20, 1),
        analysisCounts: { waiting: 3, active: 1 },
      })
      const health = await service.getHealth()
      expect(health.status).toBe('healthy')
    })

    it('degrades when the failure rate crosses the alert threshold', async () => {
      const { service } = makeService({ query: failureRouter(10, 5), analysisCounts: { waiting: 1 } })
      const health = await service.getHealth()
      expect(health.status).toBe('degraded')
    })

    it('degrades when the analysis backlog is huge even with no failures', async () => {
      const { service } = makeService({
        query: failureRouter(0, 0),
        analysisCounts: { waiting: 500, active: 4 },
      })
      const health = await service.getHealth()
      expect(health.status).toBe('degraded')
    })

    it('ignores a spiky failure rate on a tiny sample (min-sample guard)', async () => {
      // 2/2 = 100% but only 2 runs — not enough signal to page.
      const { service } = makeService({ query: failureRouter(2, 2), analysisCounts: { waiting: 0 } })
      const health = await service.getHealth()
      expect(health.status).toBe('healthy')
    })

    it('carries version + uptime + a timestamp', async () => {
      const { service } = makeService({ query: failureRouter(0, 0) })
      const health = await service.getHealth()
      expect(health.version).toHaveProperty('commit')
      expect(health.version).toHaveProperty('environment')
      expect(typeof health.uptimeSeconds).toBe('number')
      expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0)
      expect(typeof health.timestamp).toBe('string')
    })
  })

  /**
   * #2445.11 — la « preview de migration » de la console d'opérations : au plus
   * simple, le statut réel (appliquée / en attente) plutôt qu'un `migration:show`
   * en CLI que personne d'autre que celui qui a l'accès serveur ne peut lancer.
   * `_migrations` (nom de la table de suivi TypeORM, `data-source.ts`) porte les
   * lignes déjà exécutées ; `dataSource.migrations` porte TOUT ce que le build
   * connaît — la différence est le retard éventuel de déploiement.
   */
  describe('getMigrations', () => {
    it('croise `_migrations` (exécutées) et `dataSource.migrations` (connues du build)', async () => {
      const query = jest.fn().mockResolvedValue([
        { name: 'PlaybookSendSnooze1796321339748', timestamp: '1796400000000' },
        { name: 'AtsWriteRequestSnooze1796321339713', timestamp: '1796300000000' },
      ])
      const { service } = makeService({
        query,
        migrations: [
          { name: 'PlaybookSendSnooze1796321339748' },
          { name: 'AtsWriteRequestSnooze1796321339713' },
          { name: 'NewMigrationNotRunYet1796321371100' },
        ],
      })

      const report = await service.getMigrations()

      expect(report.total).toBe(3)
      expect(report.applied.map(row => row.name)).toEqual([
        'PlaybookSendSnooze1796321339748',
        'AtsWriteRequestSnooze1796321339713',
      ])
      expect(report.pending).toEqual(['NewMigrationNotRunYet1796321371100'])
    })

    it('rend les dates appliquées en ISO, dans l’ordre déjà trié par SQL', async () => {
      const query = jest.fn().mockResolvedValue([{ name: 'M1', timestamp: 1700000000000 }])
      const { service } = makeService({ query, migrations: [{ name: 'M1' }] })

      const report = await service.getMigrations()

      expect(report.applied[0]).toEqual({ name: 'M1', appliedAt: new Date(1700000000000).toISOString() })
    })

    it('ne devine jamais une date : un horodatage illisible rend `appliedAt: null`, pas « maintenant »', async () => {
      const query = jest.fn().mockResolvedValue([{ name: 'M1', timestamp: 'not-a-number' }])
      const { service } = makeService({ query, migrations: [{ name: 'M1' }] })

      const report = await service.getMigrations()

      expect(report.applied[0]).toEqual({ name: 'M1', appliedAt: null })
    })

    it('aucune migration en attente quand tout ce que le build connaît a déjà tourné', async () => {
      const query = jest.fn().mockResolvedValue([{ name: 'M1', timestamp: '1' }])
      const { service } = makeService({ query, migrations: [{ name: 'M1' }] })

      const report = await service.getMigrations()

      expect(report.pending).toEqual([])
    })

    it('lit `_migrations`, jamais une autre table', async () => {
      const query = jest.fn().mockResolvedValue([])
      const { service } = makeService({ query, migrations: [] })
      await service.getMigrations()
      expect(query.mock.calls[0]![0]).toMatch(/FROM _migrations/)
    })
  })

  /**
   * #2445.2 (épopée #2766) — le réglage vit sur l'IA (`GET
   * /config/model-routing`, GA-26) ; ce service ne fait que le RENDRE, en
   * dégradant honnêtement (`available: false`) si l'IA ne répond pas — jamais
   * une politique inventée pour combler le trou.
   */
  describe('getModelRouting', () => {
    it('rend les routes telles que l’IA les résout', async () => {
      const routes: IaModelRoutingEntry[] = [
        {
          task: 'strategy',
          provider: 'openai',
          model: 'gpt-4o',
          overridden: true,
          inheritsFrom: null,
          evalStatus: 'to_evaluate',
          evalReplayCommand: 'python -m app.eval.run --live <entreprise> --check-baseline',
        },
      ]
      const { service } = makeService({ modelRoutingPolicy: jest.fn().mockResolvedValue({ routes }) })

      const report = await service.getModelRouting()

      expect(report).toEqual({ available: true, routes })
    })

    it('IA injoignable → `available: false`, jamais une politique inventée', async () => {
      const { service } = makeService({
        modelRoutingPolicy: jest.fn().mockRejectedValue(new Error('timeout')),
      })

      const report = await service.getModelRouting()

      expect(report).toEqual({ available: false, routes: [] })
    })
  })

  /**
   * #2975 / #2440.82 — contrairement à {@link getModelRouting} (lecture,
   * best-effort), une ÉCRITURE qui échoue doit se voir : jamais un
   * `{ ok: true }` silencieux sur une IA injoignable ou une déclaration
   * invalide.
   */
  describe('declareModelRoutingEval', () => {
    it('relaie la déclaration à l’IA', async () => {
      const declareModelRoutingEval = jest.fn().mockResolvedValue({ ok: true })
      const { service } = makeService({ declareModelRoutingEval })

      const result = await service.declareModelRoutingEval('openai:gpt-4o', 'matteo@bellum-it.com', 'rejoué 08/10')

      expect(result).toEqual({ ok: true })
      expect(declareModelRoutingEval).toHaveBeenCalledWith('openai:gpt-4o', 'matteo@bellum-it.com', 'rejoué 08/10')
    })

    it('un 400 de l’IA (clé/auteur manquant) remonte en BadRequestException', async () => {
      const { service } = makeService({
        declareModelRoutingEval: jest
          .fn()
          .mockRejectedValue(new HttpError(400, 'destination_key manquant', false, '/config/model-routing/evals')),
      })

      await expect(service.declareModelRoutingEval('', 'matteo@bellum-it.com', null)).rejects.toMatchObject({
        status: 400,
      })
    })

    it('IA injoignable → BadGatewayException, jamais un succès inventé', async () => {
      const { service } = makeService({
        declareModelRoutingEval: jest.fn().mockRejectedValue(new Error('timeout')),
      })

      await expect(service.declareModelRoutingEval('openai', 'matteo@bellum-it.com', null)).rejects.toMatchObject({
        status: 502,
      })
    })
  })

  /**
   * #2445.1 (épopée #2766) — le registre vit sur l'IA (`GET
   * /config/prompt-registry`, GA-26) ; ce service ne fait que le RENDRE, en
   * dégradant honnêtement (`available: false`) si l'IA ne répond pas — jamais
   * une liste inventée pour combler le trou.
   */
  describe('getPromptRegistry', () => {
    it('rend les prompts tels que l’IA les liste', async () => {
      const prompts: IaPromptRegistryEntry[] = [{ name: 'advisor', version: 'abc123abc123' }]
      const { service } = makeService({ promptRegistry: jest.fn().mockResolvedValue({ prompts }) })

      const report = await service.getPromptRegistry()

      expect(report).toEqual({ available: true, prompts })
    })

    it('IA injoignable → `available: false`, jamais un registre inventé', async () => {
      const { service } = makeService({
        promptRegistry: jest.fn().mockRejectedValue(new Error('timeout')),
      })

      const report = await service.getPromptRegistry()

      expect(report).toEqual({ available: false, prompts: [] })
    })
  })

  /**
   * #2445.1 (épopée #2766) — diff + commande de rollback d'un prompt entre
   * deux refs git, lus en direct sur l'IA (`GET /config/prompt-registry/{name}/diff`).
   * Même prudence : `available: false` sur échec, jamais un diff inventé.
   */
  describe('getPromptRegistryDiff', () => {
    it('rend le diff et la commande de rollback tels que l’IA les rend', async () => {
      const promptRegistryDiff = jest
        .fn()
        .mockResolvedValue({ diff: '- old\n+ new', rollbackCommand: ['git', 'checkout', 'HEAD', '--', 'x'] })
      const { service, ia } = makeService({ promptRegistryDiff })

      const report = await service.getPromptRegistryDiff('advisor', 'HEAD~1', 'HEAD')

      expect(report).toEqual({
        available: true,
        diff: '- old\n+ new',
        rollbackCommand: ['git', 'checkout', 'HEAD', '--', 'x'],
      })
      expect(ia.promptRegistryDiff).toHaveBeenCalledWith('advisor', 'HEAD~1', 'HEAD')
    })

    it('IA injoignable → `available: false`, jamais un diff inventé', async () => {
      const { service } = makeService({
        promptRegistryDiff: jest.fn().mockRejectedValue(new Error('timeout')),
      })

      const report = await service.getPromptRegistryDiff('advisor', 'HEAD~1')

      expect(report).toEqual({ available: false, diff: '', rollbackCommand: [] })
    })
  })

  /**
   * #2445.4 (épopée #2766) — le classement vit sur l'IA (`GET
   * /config/rights-matrix`, GA-26, déménagé hors de `tests/` ce lot) ; ce
   * service ne fait que le RENDRE, en dégradant honnêtement
   * (`available: false`) si l'IA ne répond pas — jamais une matrice inventée.
   */
  describe('getRightsMatrix', () => {
    it('rend les outils tels que l’IA les classe', async () => {
      const tools: IaRightsMatrixEntry[] = [
        { tool: 'get_account_briefing', permission: "lecture de l'espace, scopée à la personne" },
        { tool: 'start_account_analysis', permission: 'dépense de crédits, après confirmation' },
      ]
      const { service } = makeService({ rightsMatrix: jest.fn().mockResolvedValue({ tools }) })

      const report = await service.getRightsMatrix()

      expect(report).toEqual({ available: true, tools })
    })

    it('IA injoignable → `available: false`, jamais une matrice inventée', async () => {
      const { service } = makeService({
        rightsMatrix: jest.fn().mockRejectedValue(new Error('timeout')),
      })

      const report = await service.getRightsMatrix()

      expect(report).toEqual({ available: false, tools: [] })
    })
  })

  /**
   * #3274.5 (épopée #3274) — les lignes viennent de `METHOD_CORPUS_V1`
   * (`@bellum/contracts`, GA-26), jamais recalculées ; seul `wiredAtRuntime`
   * dépend de l'IA, et dégrade honnêtement (`null`) sur échec.
   */
  describe('getMethodCorpusGovernance', () => {
    it('rend chaque règle du corpus, croisée avec les identifiants réellement branchés côté IA', async () => {
      const { service } = makeService({
        methodCorpusGovernance: jest.fn().mockResolvedValue({ wiredRuleIds: ['plan_de_compte_hebdomadaire'] }),
      })

      const report = await service.getMethodCorpusGovernance()

      expect(report.corpusVersion).toBe(METHOD_CORPUS_V1.version)
      expect(report.runtimeCrossCheckAvailable).toBe(true)
      expect(report.rules).toHaveLength(METHOD_CORPUS_V1.governance.length)

      const wired = report.rules.find(rule => rule.ruleId === 'plan_de_compte_hebdomadaire')
      expect(wired?.wiredAtRuntime).toBe(true)

      const unwired = report.rules.find(rule => rule.ruleId === 'logo_prestigieux_ne_justifie_jamais_la_priorite')
      expect(unwired?.wiredAtRuntime).toBe(false)
      expect(unwired?.owner).toBe('produit')
    })

    it('IA injoignable → `runtimeCrossCheckAvailable: false`, `wiredAtRuntime: null` sur chaque ligne — jamais un booléen deviné', async () => {
      const { service } = makeService({
        methodCorpusGovernance: jest.fn().mockRejectedValue(new Error('timeout')),
      })

      const report = await service.getMethodCorpusGovernance()

      expect(report.runtimeCrossCheckAvailable).toBe(false)
      expect(report.rules.length).toBeGreaterThan(0)
      expect(report.rules.every(rule => rule.wiredAtRuntime === null)).toBe(true)
    })
  })

  describe('getRouteMigration', () => {
    it('compose le registre à quatorze routes (#2154.3) sans I/O', () => {
      const { service } = makeService({})
      const report = service.getRouteMigration()
      expect(report.registry.total).toBe(21)
      expect(report.registry.entries).toHaveLength(21)
    })

    it('compte les routes réellement redirigées, pas déclarées à la main', () => {
      const { service } = makeService({})
      const report = service.getRouteMigration()
      const redirected = report.registry.entries.filter(entry => entry.targetStatus === 'redirected')
      expect(report.registry.redirectedCount).toBe(redirected.length)
    })

    it('rend les quatorze conditions NO-GO (onze #2154.31 + trois #2958.9x) et les huit conditions GO', () => {
      const { service } = makeService({})
      const report = service.getRouteMigration()
      expect(report.goNoGo.noGo).toHaveLength(14)
      expect(report.goNoGo.go).toHaveLength(8)
    })

    it('`canGo` reste `false` tant que les huit conditions GO ne sont pas `met`', () => {
      const { service } = makeService({})
      const report = service.getRouteMigration()
      expect(report.goNoGo.canGo).toBe(false)
      expect(report.goNoGo.go.some(condition => condition.status !== 'met')).toBe(true)
    })

    it('compose le rollback (#2154.7) — sept routes défaisables, autant que de routes redirigées', () => {
      const { service } = makeService({})
      const report = service.getRouteMigration()
      expect(report.rollback.entries).toHaveLength(21)
      expect(report.rollback.rollbackableCount).toBe(report.registry.redirectedCount)
    })

    it('compose la coexistence (#2154.8) — plus aucune route en vue partagée (#4197)', () => {
      const { service } = makeService({})
      const report = service.getRouteMigration()
      expect(report.coexistence.entries).toHaveLength(21)
      // #3962 retire « À réveiller », #4197 (L6) fait de Positionnements une route à part entière.
      expect(report.coexistence.sharedViewCount).toBe(0)
    })

    it('compose la non-régression (#2154.9/#2958.72-.93) — les trois capacités de référence, treize dimensions chacune', () => {
      const { service } = makeService({})
      const report = service.getRouteMigration()
      expect(report.nonRegression.capacities).toHaveLength(15)
      expect(report.nonRegression.capacities.every(capacity => capacity.checks.length === 13)).toBe(true)
    })

    it('compose les métriques (#2958.72-.93) — neuf émetteurs, tous instrumentés sur au moins une destination réelle (#2154.30)', () => {
      const { service } = makeService({})
      const report = service.getRouteMigration()
      expect(report.metrics.entries).toHaveLength(9)
      expect(report.metrics.instrumentedCount).toBe(9)
      expect(report.metrics.entries.every(metric => metric.aggregation === 'route_or_screen')).toBe(true)
    })

    it('rend les neuf conditions NO-GO et les sept conditions GO propres à #2208 (#2958.94-.112)', () => {
      const { service } = makeService({})
      const report = service.getRouteMigration()
      expect(report.goNoGo2208.noGo).toHaveLength(9)
      expect(report.goNoGo2208.go).toHaveLength(7)
    })

    it('`goNoGo2208` est un champ séparé de `goNoGo` (#2154.31/.32) — jamais fusionnés en une seule liste', () => {
      const { service } = makeService({})
      const report = service.getRouteMigration()
      // Les recettes humaines Antoine/Hervé/manager partagent leur clé entre les
      // deux listes (même personne, même geste, cité par #2154 ET #2208) — ce
      // n'est PAS une fusion, chaque liste reste comptée et servie séparément.
      expect(report.goNoGo.noGo).not.toBe(report.goNoGo2208.noGo)
      expect(report.goNoGo.go).not.toBe(report.goNoGo2208.go)
      expect(report.goNoGo2208.noGo.map(c => c.key)).not.toEqual(report.goNoGo.noGo.map(c => c.key))
    })

    it('`goNoGo2208.canGo` reste `false` tant que les sept conditions GO #2208 ne sont pas `met`', () => {
      const { service } = makeService({})
      const report = service.getRouteMigration()
      expect(report.goNoGo2208.canGo).toBe(false)
      expect(report.goNoGo2208.go.some(condition => condition.status !== 'met')).toBe(true)
    })
  })
})

import { AnalysisRunsService } from './analysis-runs.service'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

function build(): { service: AnalysisRunsService; repo: MockRepository<AnalysisRunEntity> } {
  const repo = createMockRepository<AnalysisRunEntity>()
  const service = new AnalysisRunsService(repo as never)
  return { service, repo }
}

describe('AnalysisRunsService', () => {
  describe('recordStart', () => {
    it('appends an "analyzing" run row carrying the scope + siren', async () => {
      const { service, repo } = build()

      await service.recordStart({
        accountId: 'acc-1',
        userId: 'user-1',
        workspaceId: 'ws-1',
        scopeMode: 'france',
        siren: '552081317',
      })

      expect(repo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          account_id: 'acc-1',
          user_id: 'user-1',
          workspace_id: 'ws-1',
          status: 'analyzing',
          scope_mode: 'france',
          siren: '552081317',
        }),
      )
    })

    it('defaults optional scope/siren/workspace to null', async () => {
      const { service, repo } = build()

      await service.recordStart({ accountId: 'acc-2', userId: 'user-2' })

      expect(repo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: null, scope_mode: null, siren: null, status: 'analyzing' }),
      )
    })

    it('never throws when the insert fails (best-effort history — hot path safe)', async () => {
      const { service, repo } = build()
      repo.insert.mockRejectedValueOnce(new Error('db down'))

      // `null` = pas de clé de corrélation. Le journal d'activité écrira alors
      // une ligne SANS statut (issue inconnue) plutôt qu'un statut inventé.
      await expect(service.recordStart({ accountId: 'acc-3', userId: 'user-3' })).resolves.toBeNull()
    })

    it('renvoie l’id du run — la clé de corrélation du journal d’activité', async () => {
      const { service, repo } = build()
      repo.insert.mockResolvedValueOnce({ identifiers: [{ id: 'run-42' }] } as never)

      await expect(service.recordStart({ accountId: 'acc-4', userId: 'user-4' })).resolves.toBe('run-42')
    })
  })

  describe('completeLatest', () => {
    it('marks the latest run terminal with its cost, via the newest-first subselect', async () => {
      const { service, repo } = build()

      await service.completeLatest('acc-1', { status: 'completed', costUsd: 0.42 })

      expect(repo.manager.query).toHaveBeenCalledTimes(1)
      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toMatch(/UPDATE analysis_runs/i)
      expect(sql).toMatch(/ORDER BY created_at DESC/i)
      expect(params[0]).toBe('acc-1')
      expect(params[1]).toBe('completed')
      expect(params[2]).toBe(0.42)
    })

    it('serialises prompt_versions to a JSON string param when provided', async () => {
      const { service, repo } = build()

      await service.completeLatest('acc-1', { status: 'completed', promptVersions: { research: 'v3' } })

      const [, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params[3]).toBe(JSON.stringify({ research: 'v3' }))
    })

    it('passes null cost/prompt_versions when omitted (COALESCE keeps existing)', async () => {
      const { service, repo } = build()

      await service.completeLatest('acc-1', { status: 'error' })

      const [, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params[1]).toBe('error')
      expect(params[2]).toBeNull()
      expect(params[3]).toBeNull()
    })

    it('#3235 — stamps market_memory_version only when the run read one (COALESCE keeps existing)', async () => {
      const { service, repo } = build()

      await service.completeLatest('acc-1', { status: 'completed', marketMemoryVersion: '2026-09-v3' })
      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toMatch(/market_memory_version = COALESCE\(\$6/i)
      expect(params[5]).toBe('2026-09-v3')

      repo.manager.query.mockClear()
      await service.completeLatest('acc-1', { status: 'completed' })
      const [, none] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(none[5]).toBeNull()
    })

    it('never throws when the update fails (best-effort — hot path safe)', async () => {
      const { service, repo } = build()
      repo.manager.query.mockRejectedValueOnce(new Error('db down'))

      await expect(service.completeLatest('acc-1', { status: 'error' })).resolves.toBeUndefined()
    })
  })

  describe('getLastRunScope', () => {
    it('renvoie mode et cadrage du run le plus récent', async () => {
      const { service, repo } = build()
      repo.findOne.mockResolvedValueOnce({ scope_mode: 'direction', scope_selection: null } as never)

      await expect(service.getLastRunScope('acc-1')).resolves.toEqual({ scopeMode: 'direction', scopeSelection: null })
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { account_id: 'acc-1' },
        order: { created_at: 'DESC' },
        select: ['scope_mode', 'scope_selection'],
      })
    })

    it('renvoie null sans run, ou si la lecture échoue', async () => {
      const { service, repo } = build()
      repo.findOne.mockResolvedValueOnce(null as never)
      await expect(service.getLastRunScope('acc-1')).resolves.toBeNull()
      repo.findOne.mockRejectedValueOnce(new Error('db'))
      await expect(service.getLastRunScope('acc-1')).resolves.toBeNull()
    })
  })

  describe('getScopeSelection', () => {
    it('renvoie le cadrage confirmé du run le plus récent', async () => {
      const { service, repo } = build()
      const selection = { excluded_entities: ['TF1 PUB'] }
      repo.findOne.mockResolvedValueOnce({ scope_selection: selection } as never)

      await expect(service.getScopeSelection('acc-1')).resolves.toBe(selection)
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { account_id: 'acc-1' },
        order: { created_at: 'DESC' },
        select: ['scope_selection'],
      })
    })

    it('renvoie null quand aucun run ne porte de cadrage', async () => {
      const { service, repo } = build()
      repo.findOne.mockResolvedValueOnce(null as never)

      await expect(service.getScopeSelection('acc-1')).resolves.toBeNull()
    })

    it('renvoie null sur erreur DB (jamais bloquant)', async () => {
      const { service, repo } = build()
      repo.findOne.mockRejectedValueOnce(new Error('db down'))

      await expect(service.getScopeSelection('acc-1')).resolves.toBeNull()
    })
  })

  describe('getLastRunUserId (#2148.11) — la provenance d’un résultat mutualisé DANS l’espace', () => {
    it('renvoie le user_id du run le plus récent', async () => {
      const { service, repo } = build()
      repo.findOne.mockResolvedValueOnce({ user_id: 'user-42' } as never)

      await expect(service.getLastRunUserId('acc-1')).resolves.toBe('user-42')
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { account_id: 'acc-1' },
        order: { created_at: 'DESC' },
        select: ['user_id'],
      })
    })

    it('renvoie null quand aucun run n’existe — jamais un auteur deviné', async () => {
      const { service, repo } = build()
      repo.findOne.mockResolvedValueOnce(null as never)

      await expect(service.getLastRunUserId('acc-1')).resolves.toBeNull()
    })

    it('renvoie null sur erreur DB (jamais bloquant)', async () => {
      const { service, repo } = build()
      repo.findOne.mockRejectedValueOnce(new Error('db down'))

      await expect(service.getLastRunUserId('acc-1')).resolves.toBeNull()
    })
  })

  describe('listForAccount', () => {
    it('returns the account runs newest-first, capped at the default limit', async () => {
      const { service, repo } = build()
      const rows = [{ id: 'run-2' }, { id: 'run-1' }] as AnalysisRunEntity[]
      repo.find.mockResolvedValueOnce(rows)

      const result = await service.listForAccount('acc-1')

      expect(repo.find).toHaveBeenCalledWith({
        where: { account_id: 'acc-1' },
        order: { created_at: 'DESC' },
        take: 20,
      })
      expect(result).toBe(rows)
    })

    it('clamps an oversized limit to the hard cap', async () => {
      const { service, repo } = build()

      await service.listForAccount('acc-1', 5000)

      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }))
    })

    it('returns [] on a DB error (never breaks the account detail read)', async () => {
      const { service, repo } = build()
      repo.find.mockRejectedValueOnce(new Error('db down'))

      await expect(service.listForAccount('acc-1')).resolves.toEqual([])
    })

    // #3235 — le cas d'un run RÉCENT : la version lue par le plan (colonne stampée à
    // `completeLatest`) ressort sur SON run, et un run d'avant le déploiement reste
    // « non mesuré » (`null`) — jamais la version d'un autre run.
    it('#3235 — un run récent expose sa version de mémoire marché ; un run plus ancien reste null', async () => {
      const { service, repo } = build()
      const rows = [
        {
          id: 'run-new',
          created_at: new Date('2026-10-02T10:00:00.000Z'),
          scope_mode: 'france',
          prompt_versions: null,
          profile_provenance: null,
          market_memory_version: '2026-09-v3',
        },
        {
          id: 'run-old',
          created_at: new Date('2026-09-29T10:00:00.000Z'),
          scope_mode: 'france',
          prompt_versions: null,
          profile_provenance: null,
          market_memory_version: null,
        },
      ] as unknown as AnalysisRunEntity[]
      repo.find.mockResolvedValueOnce(rows)

      const result = await service.listForAccount('acc-1')

      expect(result.map(run => run.versioning?.market_memory_version)).toEqual(['2026-09-v3', null])
    })

    // #2318.5 — LAU-FINAL-059 : chaque run doit porter ses neuf identifiants de
    // version. `listForAccount` les attache SANS changer la référence du
    // tableau (le test `toBe(rows)` ci-dessus le prouve) : mutation en place.
    it('#2318.5 — attache `versioning` à chaque run, sans en fabriquer un seul', async () => {
      const { service, repo } = build()
      const rows = [
        {
          id: 'run-1',
          created_at: new Date('2026-09-15T10:00:00.000Z'),
          scope_mode: 'france',
          prompt_versions: { research: 'v3' },
          profile_provenance: null,
        },
      ] as unknown as AnalysisRunEntity[]
      repo.find.mockResolvedValueOnce(rows)

      const result = await service.listForAccount('acc-1')

      expect(result).toBe(rows)
      expect(result[0].versioning).toEqual({
        analysis_version: null,
        profile_version: null,
        account_context_version: null,
        dataforge_version: null,
        market_memory_version: null,
        prompt_version: { research: 'v3' },
        scoring_version: null,
        date: '2026-09-15T10:00:00.000Z',
        scope: 'france',
      })
    })
  })

  describe('recordProfileProvenance — les trois versions de couche (#2005.11)', () => {
    const PROVENANCE = {
      mode: 'personalised' as const,
      reason: null,
      esnProfileVersion: 3,
      profileContextVersion: 1,
      answered: 10,
      required: 10,
      esnName: 'Acme ESN',
    }
    const LAYER_VERSIONS = { company: 'a-1-2', businessUnit: null, person: 'b-3-4' }

    it('écrit la provenance AVEC ses trois versions de couche', async () => {
      const { service, repo } = build()
      await service.recordProfileProvenance('run-1', { ...PROVENANCE, layerVersions: LAYER_VERSIONS })
      expect(repo.manager.query).toHaveBeenCalledTimes(1)
      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('profile_provenance')
      expect(JSON.parse(params[1] as string)).toMatchObject({ layerVersions: LAYER_VERSIONS })
    })

    it('SAIT DIRE NON — une provenance sans versions de couche n’est pas écrite, et rien ne jette', async () => {
      const { service, repo } = build()
      await expect(service.recordProfileProvenance('run-1', PROVENANCE as never)).resolves.toBeUndefined()
      await expect(
        service.recordProfileProvenance('run-1', { ...PROVENANCE, layerVersions: { company: 'a-1-2' } } as never),
      ).resolves.toBeUndefined()
      expect(repo.manager.query).not.toHaveBeenCalled()
    })
  })

  describe('sourceHealthReport', () => {
    it('supervision 30/09 — a read failure is flagged unavailable, distinct from an empty window', async () => {
      const { service, repo } = build()
      repo.manager.query.mockRejectedValueOnce(new Error('db down'))
      const failed = await service.sourceHealthReport(24)
      expect(failed.unavailable).toBe(true)
      expect(failed.sources).toEqual([])

      repo.manager.query.mockResolvedValueOnce([])
      const empty = await service.sourceHealthReport(24)
      expect(empty.unavailable).toBeUndefined()
      expect(empty.window.runsConsidered).toBe(0)
    })
  })

  describe('costSummaryForAccount', () => {
    it('coerces the aggregate numeric strings to numbers (Postgres numeric)', async () => {
      const { service, repo } = build()
      repo.manager.query.mockResolvedValueOnce([{ count: 3, total_cost: '1.230000', last_cost: '0.420000' }])

      const result = await service.costSummaryForAccount('acc-1')

      expect(repo.manager.query).toHaveBeenCalledTimes(1)
      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toMatch(/FROM analysis_runs/i)
      expect(sql).toMatch(/SUM\(cost_eur\)/i)
      expect(params[0]).toBe('acc-1')
      expect(result).toEqual({ analysesCount: 3, totalCostUsd: 1.23, lastRunCostUsd: 0.42 })
    })

    it('maps a no-run account to zero count and null costs', async () => {
      const { service, repo } = build()
      repo.manager.query.mockResolvedValueOnce([{ count: 0, total_cost: null, last_cost: null }])

      await expect(service.costSummaryForAccount('acc-1')).resolves.toEqual({
        analysesCount: 0,
        totalCostUsd: null,
        lastRunCostUsd: null,
      })
    })

    it('defaults safely when the aggregate returns no rows', async () => {
      const { service, repo } = build()
      repo.manager.query.mockResolvedValueOnce([])

      await expect(service.costSummaryForAccount('acc-1')).resolves.toEqual({
        analysesCount: 0,
        totalCostUsd: null,
        lastRunCostUsd: null,
      })
    })

    it('returns zeros/nulls on a DB error (never breaks the cost endpoint)', async () => {
      const { service, repo } = build()
      repo.manager.query.mockRejectedValueOnce(new Error('db down'))

      await expect(service.costSummaryForAccount('acc-1')).resolves.toEqual({
        analysesCount: 0,
        totalCostUsd: null,
        lastRunCostUsd: null,
      })
    })
  })

  // #2306.24 — la fiche compte répond déjà « ce dossier a-t-il été produit
  // avec un profil différent » (`ranWithOlderProfile`, `:id/profile-provenance`)
  // UN compte à la fois. Rien n'agrégeait sur le portefeuille entier — même
  // prédicat, jamais un second calcul.
  describe('listAccountsWithOlderProfile', () => {
    it('rend les comptes dont le DERNIER run porte une version de profil plus ancienne', async () => {
      const { service, repo } = build()
      repo.manager.query.mockResolvedValueOnce([{ account_id: 'acc-1', company_name: 'TF1', esn_profile_version: 2 }])

      const result = await service.listAccountsWithOlderProfile('ws-1', null, 5)

      expect(repo.manager.query).toHaveBeenCalledTimes(1)
      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toMatch(/FROM accounts/i)
      expect(sql).toMatch(/analysis_runs/i)
      expect(params).toEqual(['ws-1', 5])
      expect(result).toEqual([{ accountId: 'acc-1', companyName: 'TF1', esnProfileVersion: 2 }])
    })

    it('ne construit rien sur une comparaison impossible — version courante inconnue', async () => {
      const { service, repo } = build()

      const result = await service.listAccountsWithOlderProfile('ws-1', null, null)

      expect(result).toEqual([])
      expect(repo.manager.query).not.toHaveBeenCalled()
    })

    it('borne à un périmètre (business unit + comptes non affectés)', async () => {
      const { service, repo } = build()
      repo.manager.query.mockResolvedValueOnce([])

      await service.listAccountsWithOlderProfile(
        'ws-1',
        { businessUnitIds: ['bu-1', 'bu-2'], includeUnassigned: true },
        5,
      )

      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toMatch(/business_unit_id/i)
      expect(params).toEqual(['ws-1', ['bu-1', 'bu-2'], 5])
    })

    it('rend `[]` sur une erreur de lecture — jamais bloquant', async () => {
      const { service, repo } = build()
      repo.manager.query.mockRejectedValueOnce(new Error('db down'))

      await expect(service.listAccountsWithOlderProfile('ws-1', null, 5)).resolves.toEqual([])
    })
  })

  describe('recordStart — #3212.3, analysis_version', () => {
    const OLD_ENV = process.env

    afterEach(() => {
      process.env = OLD_ENV
    })

    it('timbre analysis_version depuis SENTRY_RELEASE quand posée', async () => {
      const { service, repo } = build()
      process.env = { ...OLD_ENV, SENTRY_RELEASE: 'rel-42', RAILWAY_GIT_COMMIT_SHA: 'sha-ignored' }

      await service.recordStart({ accountId: 'acc-1', userId: 'user-1' })

      expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ analysis_version: 'rel-42' }))
    })

    it('rend null (jamais une chaîne devinée) quand aucune des trois variables n’est posée', async () => {
      const { service, repo } = build()
      process.env = { ...OLD_ENV }
      delete process.env['SENTRY_RELEASE']
      delete process.env['RAILWAY_GIT_COMMIT_SHA']
      delete process.env['GIT_COMMIT']

      await service.recordStart({ accountId: 'acc-1', userId: 'user-1' })

      expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ analysis_version: null }))
    })
  })

  describe('recordStart — #3212.3 (épopée #3235, lot E7), account_context_version', () => {
    it('timbre account_context_version quand l’appelant la fournit', async () => {
      const { service, repo } = build()

      await service.recordStart({
        accountId: 'acc-1',
        userId: 'user-1',
        accountContextVersion: '2026-09-28T10:00:00.000Z',
      })

      expect(repo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ account_context_version: '2026-09-28T10:00:00.000Z' }),
      )
    })

    it('rend null (jamais devinée) quand l’appelant ne fournit rien', async () => {
      const { service, repo } = build()

      await service.recordStart({ accountId: 'acc-1', userId: 'user-1' })

      expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ account_context_version: null }))
    })
  })

  describe('stampVerdictSnapshot — #3212.4/.6', () => {
    it('extrait le verdict et les facteurs dominants du plan, sans rien recalculer', async () => {
      const { service, repo } = build()
      repo.manager.query.mockResolvedValueOnce([])

      await service.stampVerdictSnapshot('acc-1', {
        evaluation: {
          verdict: 'GO',
          dossier_read: {
            axes: [
              { key: 'budget', state: 'strong' },
              { key: 'timing', state: 'weak' },
              { key: 'access', state: 'moderate' },
            ],
            no_go: null,
          },
        },
      })

      expect(repo.manager.query).toHaveBeenCalledTimes(1)
      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toMatch(/UPDATE analysis_runs/i)
      expect(params[0]).toBe('acc-1')
      const snapshot = JSON.parse(params[1] as string)
      expect(snapshot).toEqual({
        verdict: 'GO',
        dominantFactors: ['budget', 'access'],
        noGoTrigger: null,
        profileVersion: null,
      })
    })

    it('nomme le déclencheur NO-GO quand `dossier_read.no_go.what` en porte un', async () => {
      const { service, repo } = build()
      repo.manager.query.mockResolvedValueOnce([])

      await service.stampVerdictSnapshot('acc-1', {
        evaluation: {
          verdict: 'NO-GO',
          dossier_read: { axes: [], no_go: { what: 'aucun accès identifié' } },
        },
      })

      const [, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      const snapshot = JSON.parse(params[1] as string)
      expect(snapshot.noGoTrigger).toBe('aucun accès identifié')
    })

    it('n’écrit rien quand le plan ne porte aucun verdict lisible — jamais un verdict deviné', async () => {
      const { service, repo } = build()

      await service.stampVerdictSnapshot('acc-1', { evaluation: {} })
      await service.stampVerdictSnapshot('acc-1', undefined)

      expect(repo.manager.query).not.toHaveBeenCalled()
    })
  })

  // #4 (recette prod 13/10, Thales — 4 analyses) : « Pourquoi le verdict a changé ? » répondait « aucune
  // révision disponible ». `explainVerdictChange` rend `null` pour un verdict IDENTIQUE comme pour un
  // historique absent : la question posée n'avait jamais de réponse. `compareLastRuns` répond toujours
  // quand ≥ 2 analyses terminées existent.
  describe('compareLastRuns — #3235 (recette 13/10)', () => {
    const snap = (verdict: string, factors: string[] = ['budget'], profileVersion = 'esn:1/context:1') => ({
      verdict,
      dominantFactors: factors,
      noGoTrigger: null,
      profileVersion,
    })
    const run = (id: string, day: string, verdict_snapshot: unknown) =>
      ({
        id,
        completed_at: new Date(`${day}T00:00:00Z`),
        created_at: new Date(`${day}T00:00:00Z`),
        verdict_snapshot,
      }) as never

    it('rend null sous deux analyses terminées', async () => {
      const { service, repo } = build()
      repo.find.mockResolvedValueOnce([run('r1', '2026-09-01', snap('GO'))])
      await expect(service.compareLastRuns('acc-1')).resolves.toBeNull()
    })

    it('verdict changé : status changed, ancien et nouveau, causes nommées', async () => {
      const { service, repo } = build()
      repo.find.mockResolvedValueOnce([
        run('r2', '2026-09-20', snap('AGIR MAINTENANT', ['budget', 'sponsor'])),
        run('r1', '2026-09-10', snap('QUALIFIER')),
      ])
      const result = await service.compareLastRuns('acc-1')
      expect(result).toMatchObject({ status: 'changed', previousVerdict: 'QUALIFIER', newVerdict: 'AGIR MAINTENANT' })
      expect(result?.causes.join(' ')).toContain('sponsor')
    })

    it('verdict IDENTIQUE : le dit, depuis quand, et ce qui a bougé', async () => {
      const { service, repo } = build()
      repo.find.mockResolvedValueOnce([
        run('r4', '2026-10-05', snap('QUALIFIER', ['budget', 'sponsor'])),
        run('r3', '2026-09-25', snap('QUALIFIER')),
        run('r2', '2026-09-10', snap('QUALIFIER')),
        run('r1', '2026-08-01', snap('ÉCARTER')),
      ])
      const result = await service.compareLastRuns('acc-1')
      expect(result?.status).toBe('unchanged')
      expect(result?.newVerdict).toBe('QUALIFIER')
      expect(result?.unchangedSince).toEqual(new Date('2026-09-10T00:00:00Z'))
      expect(result?.causes.join(' ')).toContain('sponsor')
    })

    it('verdict identique sans rien qui ait bougé : aucune cause inventée', async () => {
      const { service, repo } = build()
      repo.find.mockResolvedValueOnce([
        run('r2', '2026-10-05', snap('QUALIFIER')),
        run('r1', '2026-09-10', snap('QUALIFIER')),
      ])
      const result = await service.compareLastRuns('acc-1')
      expect(result).toMatchObject({ status: 'unchanged', causes: [] })
    })

    it('#3235 (r40) — une analyse antérieure sans instantané est SAUTÉE : on compare les deux qui portent un verdict', async () => {
      const { service, repo } = build()
      repo.find.mockResolvedValueOnce([
        run('r3', '2026-10-05', snap('QUALIFIER')),
        run('r2', '2026-09-20', null),
        run('r1', '2026-09-10', snap('ÉCARTER')),
      ])
      const result = await service.compareLastRuns('acc-1')
      expect(result).toMatchObject({ status: 'changed', previousVerdict: 'ÉCARTER', newVerdict: 'QUALIFIER' })
      expect(result?.previousAt).toEqual(new Date('2026-09-10T00:00:00Z'))
    })

    it('#3235 (r40) — un seul run porte un verdict : « même verdict depuis » SA date, et le dit (jamais un ancien verdict deviné)', async () => {
      const { service, repo } = build()
      repo.find.mockResolvedValueOnce([run('r2', '2026-10-05', snap('QUALIFIER')), run('r1', '2026-09-10', null)])
      const result = await service.compareLastRuns('acc-1')
      expect(result).toMatchObject({ status: 'unchanged', newVerdict: 'QUALIFIER', onlyOneRunCarriesVerdict: true })
      expect(result?.unchangedSince).toEqual(new Date('2026-10-05T00:00:00Z'))
    })

    it('la dernière analyse sans instantané lit le verdict COURANT du dossier (rattrapage en lecture)', async () => {
      const { service, repo } = build()
      repo.find.mockResolvedValueOnce([run('r2', '2026-10-05', null), run('r1', '2026-09-10', snap('QUALIFIER'))])
      const result = await service.compareLastRuns('acc-1', 'QUALIFIER')
      expect(result).toMatchObject({ status: 'unchanged', newVerdict: 'QUALIFIER' })
    })
  })

  // #3235 (recette prod 14/10, Thales) : « aucune cause de changement enregistrée » sur d'ANCIENS runs sans
  // instantané. Les causes qui tiennent aux LIGNES de run (modèle, pipeline, scoring, sources dégradées) se
  // calculent sans instantané : elles ne dépendent pas de lui.
  describe('compareLastRuns — causes sans instantané (#3235, 14/10)', () => {
    const row = (id: string, day: string, extra: Record<string, unknown> = {}) =>
      ({
        id,
        completed_at: new Date(`${day}T00:00:00Z`),
        created_at: new Date(`${day}T00:00:00Z`),
        verdict_snapshot: null,
        ...extra,
      }) as never

    it('deux runs sans instantané : unreadable, mais le modèle et la source dégradée qui ont bougé sont NOMMÉS', async () => {
      const { service, repo } = build()
      repo.find.mockResolvedValueOnce([
        row('r2', '2026-10-12', {
          prompt_versions: { model: 'claude-b' },
          source_health: {
            degraded: [{ source: 'pappers', reason: 'quota', code: 'quota_exceeded' }],
            observed: ['pappers'],
          },
        }),
        row('r1', '2026-09-11', {
          prompt_versions: { model: 'claude-a' },
          source_health: { degraded: [], observed: ['pappers'] },
        }),
      ])
      const result = await service.compareLastRuns('acc-1')
      expect(result?.status).toBe('unreadable')
      const causes = (result?.causes ?? []).join(' | ')
      expect(causes).toContain('claude-a → claude-b')
      expect(causes).toMatch(/pappers/i)
    })

    it('NON : une source dégradée dans les DEUX runs n’est pas une cause de changement', async () => {
      const { service, repo } = build()
      const health = { degraded: [{ source: 'pappers', reason: 'quota' }], observed: ['pappers'] }
      repo.find.mockResolvedValueOnce([
        row('r2', '2026-10-12', { source_health: health }),
        row('r1', '2026-09-11', { source_health: health }),
      ])
      const result = await service.compareLastRuns('acc-1')
      expect(result?.causes).toEqual([])
    })

    it('verdict changé avec instantanés mais rien de nommable : la cause non capturée reste dite', async () => {
      const { service, repo } = build()
      const snap = (verdict: string) => ({ verdict, dominantFactors: [], noGoTrigger: null, profileVersion: null })
      repo.find.mockResolvedValueOnce([
        row('r2', '2026-10-12', { verdict_snapshot: snap('PRUDENT') }),
        row('r1', '2026-09-11', { verdict_snapshot: snap('GO') }),
      ])
      const result = await service.compareLastRuns('acc-1')
      expect(result).toMatchObject({ status: 'changed', causes: ['cause non capturée par cet instantané'] })
    })

    it('les no-go des deux instantanés voyagent avec la comparaison (Laura nomme le verdict, pas le code brut)', async () => {
      const { service, repo } = build()
      const snap = (verdict: string, noGoTrigger: string | null) => ({
        verdict,
        dominantFactors: [],
        noGoTrigger,
        profileVersion: null,
      })
      repo.find.mockResolvedValueOnce([
        row('r2', '2026-10-12', { verdict_snapshot: snap('STOP', 'budget gelé') }),
        row('r1', '2026-09-11', { verdict_snapshot: snap('PRUDENT', null) }),
      ])
      const result = await service.compareLastRuns('acc-1')
      expect(result).toMatchObject({ previousNoGoTrigger: null, newNoGoTrigger: 'budget gelé' })
    })
  })

  describe('explainVerdictChange — #3212.4', () => {
    it('rend null quand moins de deux runs terminés existent', async () => {
      const { service, repo } = build()
      repo.find.mockResolvedValueOnce([{ id: 'run-1', verdict_snapshot: { verdict: 'GO' } }])

      await expect(service.explainVerdictChange('acc-1')).resolves.toBeNull()
    })

    it('rend null quand le verdict n’a pas changé — rien à expliquer', async () => {
      const { service, repo } = build()
      const snapshot = {
        verdict: 'GO',
        dominantFactors: ['budget'],
        noGoTrigger: null,
        profileVersion: 'esn:1/context:1',
      }
      repo.find.mockResolvedValueOnce([
        { id: 'run-2', verdict_snapshot: snapshot, completed_at: new Date('2026-09-20') },
        { id: 'run-1', verdict_snapshot: snapshot, completed_at: new Date('2026-09-10') },
      ])

      await expect(service.explainVerdictChange('acc-1')).resolves.toBeNull()
    })

    it('nomme les causes quand le verdict a changé : facteurs dominants et profil', async () => {
      const { service, repo } = build()
      repo.find.mockResolvedValueOnce([
        {
          id: 'run-2',
          completed_at: new Date('2026-09-20T00:00:00Z'),
          verdict_snapshot: {
            verdict: 'GO',
            dominantFactors: ['budget', 'sponsor'],
            noGoTrigger: null,
            profileVersion: 'esn:2/context:1',
          },
        },
        {
          id: 'run-1',
          completed_at: new Date('2026-09-10T00:00:00Z'),
          verdict_snapshot: {
            verdict: 'NO-GO',
            dominantFactors: ['budget'],
            noGoTrigger: 'aucun accès identifié',
            profileVersion: 'esn:1/context:1',
          },
        },
      ])

      const revision = await service.explainVerdictChange('acc-1')

      expect(revision).not.toBeNull()
      expect(revision?.previousVerdict).toBe('NO-GO')
      expect(revision?.newVerdict).toBe('GO')
      expect(revision?.changedAt).toEqual(new Date('2026-09-20T00:00:00Z'))
      expect(revision?.causes).toEqual(
        expect.arrayContaining([
          expect.stringContaining('sponsor'),
          expect.stringContaining("n'est plus levé"),
          expect.stringContaining('esn:1/context:1'),
        ]),
      )
    })

    // #3212.7 (épopée #3235, lot E7) — scénario « nouvelle source » : une
    // évidence externe qui apparaît sort du même diff qu'un facteur dominant
    // apparu, isolée ici pour porter le nom exact du scénario que #3212
    // nomme (le profil et le NO-GO restent inchangés, à dessein).
    it('#3212.7 — nouvelle source : un facteur dominant apparu, seul, se nomme comme cause', async () => {
      const { service, repo } = build()
      repo.find.mockResolvedValueOnce([
        {
          id: 'run-2',
          completed_at: new Date('2026-09-22T00:00:00Z'),
          verdict_snapshot: {
            verdict: 'GO',
            dominantFactors: ['budget', 'nomination_verifiee'],
            noGoTrigger: null,
            profileVersion: 'esn:1/context:1',
          },
        },
        {
          id: 'run-1',
          completed_at: new Date('2026-09-15T00:00:00Z'),
          verdict_snapshot: {
            verdict: 'PRUDENT',
            dominantFactors: ['budget'],
            noGoTrigger: null,
            profileVersion: 'esn:1/context:1',
          },
        },
      ])

      const revision = await service.explainVerdictChange('acc-1')

      expect(revision?.previousVerdict).toBe('PRUDENT')
      expect(revision?.newVerdict).toBe('GO')
      expect(revision?.causes).toEqual(['nouveaux facteurs dominants : nomination_verifiee'])
    })

    // #3212.7 (épopée #3235, lot E7) — scénario « modèle différent ». Le
    // modèle est déjà timbré par IA dans `prompt_versions.model`
    // (`_prompt_versions_stamp`, `builder.py`) mais SUR LA LIGNE DU RUN, pas
    // dans `verdict_snapshot` — `stampVerdictSnapshot` tourne à la phase
    // `plan`, avant que `run_completed` n'écrive `prompt_versions`
    // (`completeLatest`). Comparer les DEUX runs déjà chargés évite de
    // dupliquer le modèle dans un second instantané.
    it('#3212.7 — modèle différent : nomme le changement de modèle entre les deux runs', async () => {
      const { service, repo } = build()
      repo.find.mockResolvedValueOnce([
        {
          id: 'run-2',
          completed_at: new Date('2026-09-25T00:00:00Z'),
          prompt_versions: { model: 'claude-opus-5-5' },
          verdict_snapshot: {
            verdict: 'GO',
            dominantFactors: ['budget'],
            noGoTrigger: null,
            profileVersion: 'esn:1/context:1',
          },
        },
        {
          id: 'run-1',
          completed_at: new Date('2026-09-18T00:00:00Z'),
          prompt_versions: { model: 'claude-sonnet-5' },
          verdict_snapshot: {
            verdict: 'PRUDENT',
            dominantFactors: ['budget'],
            noGoTrigger: null,
            profileVersion: 'esn:1/context:1',
          },
        },
      ])

      const revision = await service.explainVerdictChange('acc-1')

      expect(revision?.causes).toEqual(
        expect.arrayContaining([expect.stringContaining('claude-sonnet-5 → claude-opus-5-5')]),
      )
    })

    it('ne nomme rien sur le modèle quand `prompt_versions` est absent d’un des deux runs — jamais deviné', async () => {
      const { service, repo } = build()
      repo.find.mockResolvedValueOnce([
        {
          id: 'run-2',
          completed_at: new Date('2026-09-25T00:00:00Z'),
          verdict_snapshot: {
            verdict: 'GO',
            dominantFactors: ['budget', 'sponsor'],
            noGoTrigger: null,
            profileVersion: 'esn:1/context:1',
          },
        },
        {
          id: 'run-1',
          completed_at: new Date('2026-09-18T00:00:00Z'),
          prompt_versions: { model: 'claude-sonnet-5' },
          verdict_snapshot: {
            verdict: 'PRUDENT',
            dominantFactors: ['budget'],
            noGoTrigger: null,
            profileVersion: 'esn:1/context:1',
          },
        },
      ])

      const revision = await service.explainVerdictChange('acc-1')

      expect(revision?.causes.some(c => c.includes('modèle'))).toBe(false)
    })

    // #3235 (réserve, recette 07/10) — « pourquoi le verdict a changé ? » ne
    // citait ni la révision du pipeline ni la version de scoring, alors que
    // les deux runs les portent déjà (`analysis_version`, `prompt_versions.
    // prompts.scorer`) — seul le modèle et le profil étaient comparés.
    it('#3235 — pipeline et scoring différents : les deux versions se nomment quand elles existent', async () => {
      const { service, repo } = build()
      repo.find.mockResolvedValueOnce([
        {
          id: 'run-2',
          completed_at: new Date('2026-10-05T00:00:00Z'),
          analysis_version: 'rev-def456',
          prompt_versions: { model: 'claude-sonnet-5', prompts: { scorer: 'hash-b' } },
          verdict_snapshot: {
            verdict: 'GO',
            dominantFactors: ['budget'],
            noGoTrigger: null,
            profileVersion: 'esn:1/context:1',
          },
        },
        {
          id: 'run-1',
          completed_at: new Date('2026-09-28T00:00:00Z'),
          analysis_version: 'rev-abc123',
          prompt_versions: { model: 'claude-sonnet-5', prompts: { scorer: 'hash-a' } },
          verdict_snapshot: {
            verdict: 'PRUDENT',
            dominantFactors: ['budget'],
            noGoTrigger: null,
            profileVersion: 'esn:1/context:1',
          },
        },
      ])

      const revision = await service.explainVerdictChange('acc-1')

      expect(revision?.causes).toEqual(
        expect.arrayContaining([
          expect.stringContaining('rev-abc123 → rev-def456'),
          expect.stringContaining('hash-a → hash-b'),
        ]),
      )
    })

    it('ne nomme ni pipeline ni scoring quand l’un des deux runs ne les porte pas — jamais deviné', async () => {
      const { service, repo } = build()
      repo.find.mockResolvedValueOnce([
        {
          id: 'run-2',
          completed_at: new Date('2026-10-05T00:00:00Z'),
          analysis_version: 'rev-def456',
          verdict_snapshot: {
            verdict: 'GO',
            dominantFactors: ['sponsor'],
            noGoTrigger: null,
            profileVersion: 'esn:1/context:1',
          },
        },
        {
          id: 'run-1',
          completed_at: new Date('2026-09-28T00:00:00Z'),
          verdict_snapshot: {
            verdict: 'PRUDENT',
            dominantFactors: [],
            noGoTrigger: null,
            profileVersion: 'esn:1/context:1',
          },
        },
      ])

      const revision = await service.explainVerdictChange('acc-1')

      expect(revision?.causes.some(c => c.includes('pipeline'))).toBe(false)
      expect(revision?.causes.some(c => c.includes('scoring'))).toBe(false)
    })

    it('rend une cause nommée même quand rien de capturé ne diverge — jamais un changement sans explication', async () => {
      const { service, repo } = build()
      repo.find.mockResolvedValueOnce([
        {
          id: 'run-2',
          completed_at: new Date('2026-09-20T00:00:00Z'),
          verdict_snapshot: { verdict: 'GO', dominantFactors: [], noGoTrigger: null, profileVersion: null },
        },
        {
          id: 'run-1',
          completed_at: new Date('2026-09-10T00:00:00Z'),
          verdict_snapshot: { verdict: 'NO-GO', dominantFactors: [], noGoTrigger: null, profileVersion: null },
        },
      ])

      const revision = await service.explainVerdictChange('acc-1')
      expect(revision?.causes).toEqual(['cause non capturée par cet instantané'])
    })
  })
})

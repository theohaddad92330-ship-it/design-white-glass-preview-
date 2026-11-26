import { CopilotBridgeController } from './copilot-bridge.controller'

/**
 * #2985 (revue manager, section G de #2319) — « transformer le même dossier
 * en revue de dix minutes », composée depuis trois lectures qui existent déjà
 * ailleurs (`AccountsService.changeDigest`, `ActionPlanItemsService.listForAccount`,
 * `ProjectsService.listForWorkspace`). Aucun second calcul, aucune donnée
 * inventée — voir le docblock de `accountManagerReview`.
 */
describe('CopilotBridgeController.accountManagerReview (#2985)', () => {
  const USER_ID = '99999999-9999-9999-9999-999999999999'
  const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111'
  const ITEM_DONE = '22222222-2222-2222-2222-222222222222'
  const ITEM_STALLED = '33333333-3333-3333-3333-333333333333'
  const ITEM_FUTURE = '44444444-4444-4444-4444-444444444444'
  const ITEM_SNOOZED = '55555555-5555-5555-5555-555555555555'
  const ITEM_NO_DUE = '66666666-6666-6666-6666-666666666666'
  const PROJECT_WITH_RISK = '77777777-7777-7777-7777-777777777777'
  const PROJECT_NO_RISK = '88888888-8888-8888-8888-888888888888'
  const PROJECT_ARCHIVED = '00000000-0000-0000-0000-000000000000'

  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) }
  const account = { type: 'success', output: { id: ACCOUNT_ID, company_name: 'Société Générale' } } as const

  function item(id: string, overrides: Record<string, unknown>) {
    return {
      id,
      label: 'Relancer après le comité',
      target: null,
      owner_name: null,
      execution_status: 'todo',
      due_date: null,
      completed_at: null,
      ...overrides,
    }
  }

  // GA-333 (mesuré à l'intégration chantier A, 26/09) — `resolveBusinessUnitScope`
  // exige un service présent (sinon il LÈVE, plutôt que d'ouvrir le compte sans
  // périmètre) : même construction que `copilot-accounts-search.controller.spec.ts`,
  // `scopeFor` renvoie `null` par défaut — aucun périmètre BU actif dans cet espace.
  const businessUnits = { scopeFor: jest.fn().mockResolvedValue(null) }

  const GAP = { id: 'g1', label: 'Direction financière', reason: 'Aucun contact connu' }
  const coverageOk = jest.fn().mockResolvedValue({ gaps: [GAP, { ...GAP, id: 'g2', label: 'DSI' }] })

  function call(deps: Record<string, unknown>) {
    return CopilotBridgeController.prototype.accountManagerReview.call(
      {
        workspaceContext,
        accounts: { findOneForWorkspace: jest.fn().mockResolvedValue(account) },
        businessUnits,
        accountCoverageMap: coverageOk,
        ...deps,
      } as never,
      { userId: USER_ID, accountId: ACCOUNT_ID } as never,
    )
  }

  it('sépare les actions réalisées des actions non avancées, et relaie le tiroir et les risques tels quels', async () => {
    const changeDigest = {
      comparedAt: '2026-09-26T00:00:00.000Z',
      changed: [],
      appeared: [],
      disappeared: [],
      unchanged: ['sector'],
    }
    const accounts = {
      findOneForWorkspace: jest.fn().mockResolvedValue(account),
      changeDigest: jest.fn().mockResolvedValue(changeDigest),
      listAccountSignals: jest.fn().mockResolvedValue([]),
    }
    const actionItems = {
      listForAccount: jest
        .fn()
        .mockResolvedValue([
          item(ITEM_DONE, { execution_status: 'done', completed_at: '2026-09-20T00:00:00.000Z' }),
          item(ITEM_STALLED, { execution_status: 'todo', due_date: '2020-01-01' }),
          item(ITEM_FUTURE, { execution_status: 'todo', due_date: '2999-01-01' }),
          item(ITEM_SNOOZED, { execution_status: 'snoozed', due_date: '2020-01-01' }),
          item(ITEM_NO_DUE, { execution_status: 'todo', due_date: null }),
        ]),
    }
    const projects = {
      listOwnerResourceConflicts: jest.fn().mockResolvedValue([]),
      listForWorkspace: jest.fn().mockResolvedValue([
        { id: PROJECT_WITH_RISK, label: 'Migration ERP', risks: ' Sponsor absent trois semaines. ', archived_at: null },
        { id: PROJECT_NO_RISK, label: 'Sans risque écrit', risks: null, archived_at: null },
        { id: PROJECT_ARCHIVED, label: 'Rangée', risks: 'Ignoré, archivée', archived_at: '2026-01-01T00:00:00.000Z' },
      ]),
    }

    const out = (await call({ accounts, actionItems, projects })) as {
      changeDigest: unknown
      actionsCompleted: { id: string }[]
      actionsStalled: { id: string; dueDate: string }[]
      risks: { projectId: string; risks: string }[]
    }

    expect(out.changeDigest).toEqual(changeDigest)
    expect(out.actionsCompleted.map(a => a.id)).toEqual([ITEM_DONE])
    expect(out.actionsStalled.map(a => a.id)).toEqual([ITEM_STALLED])
    expect(out.actionsStalled[0].dueDate).toBe('2020-01-01')
    expect(out.risks).toEqual([
      { projectId: PROJECT_WITH_RISK, projectLabel: 'Migration ERP', risks: 'Sponsor absent trois semaines.' },
    ])
    expect(actionItems.listForAccount).toHaveBeenCalledWith(USER_ID, ACCOUNT_ID)
    expect(projects.listForWorkspace).toHaveBeenCalledWith('w-1', ACCOUNT_ID)
  })

  it('un compte introuvable ou étranger reste introuvable, jamais un détail qui fuit', async () => {
    const accounts = { findOneForWorkspace: jest.fn().mockResolvedValue({ type: 'failure', problem: 'not_found' }) }
    const out = await call({
      accounts,
      actionItems: { listForAccount: jest.fn() },
      projects: { listForWorkspace: jest.fn(), listOwnerResourceConflicts: jest.fn() },
    })
    expect(out).toEqual({ error: 'account_not_found' })
  })

  it('sans les services optionnels, le DIT plutôt que de faire tomber le pont', async () => {
    const out = await call({ actionItems: undefined, projects: undefined })
    expect(out).toEqual({ error: 'account_manager_review_unavailable' })
  })

  describe('verdict, couverture, faits importants, décisions demandées (#2985)', () => {
    const base = () => ({
      accounts: {
        findOneForWorkspace: jest.fn().mockResolvedValue(account),
        changeDigest: jest.fn().mockResolvedValue(null),
        listAccountSignals: jest.fn().mockResolvedValue([]),
      },
      actionItems: { listForAccount: jest.fn().mockResolvedValue([]) },
      projects: {
        listForWorkspace: jest.fn().mockResolvedValue([]),
        listOwnerResourceConflicts: jest.fn().mockResolvedValue([]),
      },
    })
    type Out = {
      verdict: { status: string; reasons: { kind: string; count: number }[]; notEvaluated: string[] }
      coverage: { gapCount: number; gaps: { label: string }[] } | null
      importantFacts: { label: string; date: string | null }[]
      decisionsRequested: { id: string }[]
      arbitrationsRequested: { consultantName: string; accountOwnerName: string; resourceOwnerName: string }[]
    }

    it('« attention » avec des raisons COMPTÉES, jamais une probabilité', async () => {
      const deps = base()
      deps.actionItems.listForAccount.mockResolvedValue([
        item(ITEM_STALLED, { due_date: '2020-01-01' }),
        item(ITEM_FUTURE, { execution_status: 'prepared' }),
      ])
      deps.projects.listForWorkspace.mockResolvedValue([
        { id: PROJECT_WITH_RISK, label: 'ERP', risks: 'Sponsor absent', archived_at: null },
      ])
      const out = (await call(deps)) as Out
      expect(out.verdict.status).toBe('attention')
      expect(out.verdict.reasons).toEqual([
        { kind: 'stalled_actions', count: 1 },
        { kind: 'risks', count: 1 },
        { kind: 'coverage_gaps', count: 2 },
        { kind: 'decisions_pending', count: 1 },
      ])
      expect(JSON.stringify(out.verdict)).not.toMatch(/probab|percent|%/i)
      expect(out.decisionsRequested.map(d => d.id)).toEqual([ITEM_FUTURE])
      expect(out.coverage).toEqual({
        gapCount: 2,
        gaps: [
          { label: 'Direction financière', reason: 'Aucun contact connu' },
          { label: 'DSI', reason: 'Aucun contact connu' },
        ],
      })
    })

    it('#2319 — un conflit de porteur est relayé tel quel et COMPTÉ dans le verdict', async () => {
      const deps = base()
      const conflict = {
        projectId: PROJECT_WITH_RISK,
        projectLabel: 'Refonte portail',
        needTitle: 'Ingénieur infrastructure',
        consultantId: ITEM_DONE,
        consultantName: 'Karim B.',
        accountOwnerName: 'Louis S',
        resourceOwnerName: 'Marie D',
      }
      deps.projects.listOwnerResourceConflicts.mockResolvedValue([conflict])
      const out = (await call({ ...deps, accountCoverageMap: jest.fn().mockResolvedValue({ gaps: [] }) })) as Out
      expect(out.arbitrationsRequested).toEqual([conflict])
      expect(out.verdict.status).toBe('attention')
      expect(out.verdict.reasons).toEqual([{ kind: 'arbitrations_pending', count: 1 }])
      expect(deps.projects.listOwnerResourceConflicts).toHaveBeenCalledWith('w-1', ACCOUNT_ID)
    })

    it('#2319 — aucun conflit connu : aucune ligne et aucune raison à zéro', async () => {
      const deps = base()
      const out = (await call({ ...deps, accountCoverageMap: jest.fn().mockResolvedValue({ gaps: [] }) })) as Out
      expect(out.arbitrationsRequested).toEqual([])
      expect(out.verdict.reasons.map(r => r.kind)).not.toContain('arbitrations_pending')
    })

    it('« stable » seulement si un axe a été lu ET rien ne pèse', async () => {
      const deps = base()
      deps.actionItems.listForAccount.mockResolvedValue([item(ITEM_DONE, { execution_status: 'done' })])
      const out = (await call({ ...deps, accountCoverageMap: jest.fn().mockResolvedValue({ gaps: [] }) })) as Out
      expect(out.verdict).toEqual({ status: 'stable', reasons: [], notEvaluated: ['change_digest'] })
      expect(out.coverage).toEqual({ gapCount: 0, gaps: [] })
    })

    it('couverture illisible → `null`, NOMMÉE non évaluée, jamais « aucun manque » ; rien lu → not_evaluable', async () => {
      const out = (await call({
        ...base(),
        accountCoverageMap: jest.fn().mockResolvedValue({ error: 'account_coverage_map_unavailable' }),
      })) as Out
      expect(out.coverage).toBeNull()
      expect(out.verdict.status).toBe('not_evaluable')
      expect(out.verdict.notEvaluated).toEqual(['coverage', 'plan', 'change_digest'])
    })

    it('ne garde que les signaux `high` ENCORE ACTIFS de CE compte (le NON : autre compte, medium, résolu)', async () => {
      const deps = base()
      deps.accounts.listAccountSignals.mockResolvedValue([
        {
          account_id: ACCOUNT_ID,
          label: 'AO cloud annoncé',
          importance: 'high',
          history_status: 'active',
          date: '2026-09-28',
        },
        {
          account_id: ACCOUNT_ID,
          label: 'Recrutement DSI',
          importance: 'medium',
          history_status: 'active',
          date: null,
        },
        { account_id: ACCOUNT_ID, label: 'Ancien AO', importance: 'high', history_status: 'resolved', date: null },
        {
          account_id: 'autre-compte',
          label: 'Privé ailleurs',
          importance: 'high',
          history_status: 'active',
          date: null,
        },
      ])
      const out = (await call(deps)) as Out
      expect(out.importantFacts).toEqual([{ label: 'AO cloud annoncé', date: '2026-09-28' }])
    })

    it('une lecture de signaux qui échoue est NOMMÉE (`signals`), le reste de la revue sort quand même', async () => {
      const deps = base()
      deps.accounts.listAccountSignals.mockRejectedValue(new Error('boom'))
      const out = (await call(deps)) as Out
      expect(out.importantFacts).toEqual([])
      expect(out.verdict.notEvaluated).toContain('signals')
    })
  })
})

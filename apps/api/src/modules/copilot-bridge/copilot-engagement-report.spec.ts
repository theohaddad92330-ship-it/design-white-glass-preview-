import { CopilotBridgeController } from './copilot-bridge.controller'

/**
 * #3903 — « sur les 90 derniers jours, chez qui puis-je relancer pour faire
 * du business ? ». MÊME lecture que `ActivitiesService.engagementReport`,
 * jamais un second moteur (GA-26). Voir le docblock d'`accountsEngagementReport`
 * (`copilot-bridge.controller.ts`).
 */
describe('CopilotBridgeController.accountsEngagementReport (#3903)', () => {
  const USER_ID = '99999999-9999-9999-9999-999999999999'

  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) }

  function row(overrides: Record<string, unknown> = {}) {
    return {
      accountId: 'acc-1',
      companyName: 'SNCF',
      lastOccurredAt: '2026-09-01T00:00:00.000Z',
      lastDirection: 'outbound' as const,
      lastKind: 'email',
      attempts: 3,
      category: 'a_relancer' as const,
      ...overrides,
    }
  }

  function call(deps: Record<string, unknown>, dto: Record<string, unknown>) {
    return CopilotBridgeController.prototype.accountsEngagementReport.call(
      {
        workspaceContext,
        activities: {
          engagementReport: jest.fn().mockResolvedValue([]),
          observedInteractionKinds: jest.fn().mockResolvedValue([]),
          hasCrmDealCache: jest.fn().mockResolvedValue(false),
          ...deps,
        },
      } as never,
      { userId: USER_ID, ...dto } as never,
    )
  }

  it('sans sinceDate : calcule la fenêtre depuis windowDays (défaut 90)', async () => {
    const engagementReport = jest.fn().mockResolvedValue([])
    await call({ engagementReport }, {})
    const [, sinceIso] = engagementReport.mock.calls[0] as [string, string]
    const daysAgo = (Date.now() - Date.parse(sinceIso)) / (24 * 60 * 60 * 1000)
    expect(daysAgo).toBeGreaterThan(89.9)
    expect(daysAgo).toBeLessThan(90.1)
  })

  it('avec sinceDate explicite : l’utilise telle quelle, jamais windowDays', async () => {
    const engagementReport = jest.fn().mockResolvedValue([])
    await call({ engagementReport }, { sinceDate: '2026-07-01' })
    expect(engagementReport).toHaveBeenCalledWith('w-1', '2026-07-01T00:00:00.000Z')
  })

  it('relaie les comptes TELS QUE le service les rend, avec leur catégorie', async () => {
    const out = (await call({ engagementReport: jest.fn().mockResolvedValue([row()]) }, {})) as {
      accounts: unknown[]
    }
    expect(out.accounts).toEqual([row()])
  })

  it('#3903 (recette NB 10/10) — sans CRM lu, le nombre d’affaires ouvertes est ABSENT, jamais 0', async () => {
    const withDeals = row({ openCrmDeals: 0, openCrmDealNames: [] })
    const out = (await call({ engagementReport: jest.fn().mockResolvedValue([withDeals]) }, {})) as {
      accounts: Array<Record<string, unknown>>
    }
    expect(out.accounts[0]).not.toHaveProperty('openCrmDeals')
    expect(out.accounts[0]).not.toHaveProperty('openCrmDealNames')
    expect(out.accounts[0]).toHaveProperty('companyName', 'SNCF')
  })

  it('#3903 (recette NB 10/10) — avec un CRM lu, le compte d’affaires ouvertes (même 0) est relayé', async () => {
    const withDeals = row({ openCrmDeals: 0, openCrmDealNames: [] })
    const out = (await call(
      {
        engagementReport: jest.fn().mockResolvedValue([withDeals]),
        hasCrmDealCache: jest.fn().mockResolvedValue(true),
      },
      {},
    )) as { accounts: Array<Record<string, unknown>> }
    expect(out.accounts[0]).toHaveProperty('openCrmDeals', 0)
  })

  it('nomme les canaux sans AUCUNE ligne dans la fenêtre — jamais deviné', async () => {
    const out = (await call({ observedInteractionKinds: jest.fn().mockResolvedValue(['email', 'call']) }, {})) as {
      sourcesCoverage: { observed: string[]; notObserved: string[] }
    }
    expect(out.sourcesCoverage.observed).toEqual(['email', 'call'])
    expect(out.sourcesCoverage.notObserved).toEqual(['meeting', 'linkedin'])
  })

  it('nomme ce que ce bilan ne croise PAS (statut de deal sans CRM lu) — jamais deviné', async () => {
    const out = (await call({}, {})) as { notEvaluated: string[] }
    expect(out.notEvaluated).toEqual(['open_deal_status'])
  })

  it('#3903 (lot M01) — un cache CRM lu : le statut de deal EST croisé, plus rien n’est nommé manquant', async () => {
    const out = (await call({ hasCrmDealCache: jest.fn().mockResolvedValue(true) }, {})) as { notEvaluated: string[] }
    expect(out.notEvaluated).toEqual([])
  })

  it('#3903 (décision Louis 09/10) — « nogo déjà retenté » est abandonné : jamais nommé comme un manque', async () => {
    for (const hasCrm of [true, false]) {
      const out = (await call({ hasCrmDealCache: jest.fn().mockResolvedValue(hasCrm) }, {})) as {
        notEvaluated: string[]
      }
      expect(out.notEvaluated).not.toContain('nogo_retry')
    }
  })

  it('aucune interaction dans la fenêtre : accounts: [], jamais une erreur', async () => {
    const out = (await call({}, {})) as { accounts: unknown[] }
    expect(out.accounts).toEqual([])
  })
})

/**
 * #3904 — DÉCISION LOUIS 09/10 : « proche de signer » = une opportunité au stade
 * proposition OU négociation (Bellum ou CRM branché). La source lue se nomme ;
 * un CRM jamais lu se NOMME (`crm: null`), jamais « aucune affaire CRM ».
 */
describe('CopilotBridgeController.accountsNearSigning (#3904)', () => {
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) }
  const BELLUM = [{ accountId: 'a1', companyName: 'Alstom', opportunityId: 'o1', label: 'TMA', stage: 'negotiation' }]
  const CRM = [{ accountId: 'a2', companyName: 'SG', dealName: 'Refonte', stageLabel: 'Proposition' }]

  function call(hasCrm: boolean) {
    return CopilotBridgeController.prototype.accountsNearSigning.call(
      {
        workspaceContext,
        activities: {
          nearSigning: jest.fn().mockResolvedValue({ bellum: BELLUM, crm: CRM }),
          hasCrmDealCache: jest.fn().mockResolvedValue(hasCrm),
        },
      } as never,
      { userId: '99999999-9999-9999-9999-999999999999' } as never,
    ) as Promise<{ bellum: unknown[]; crm: unknown[] | null }>
  }

  it('un CRM lu : relaie les deux sources', async () => {
    const out = await call(true)
    expect(out.bellum).toEqual(BELLUM)
    expect(out.crm).toEqual(CRM)
  })

  it('aucun CRM lu : `crm` vaut null — nommé, jamais une liste vide qui se lirait « rien »', async () => {
    const out = await call(false)
    expect(out.bellum).toEqual(BELLUM)
    expect(out.crm).toBeNull()
  })
})

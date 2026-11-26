import { NotFoundException } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { InternalTeamKpisController } from './internal-team-kpis.controller'
import type { TeamKpisService } from './team-kpis.service'

describe('InternalTeamKpisController', () => {
  let service: { getTeams: jest.Mock; getTeamDetail: jest.Mock }
  let managerKpis: Record<string, jest.Mock>
  let chatbotFunnel: { overview: jest.Mock }
  let messageLearningSignals: {
    expressSignals: jest.Mock
    recordProposedRuleSnapshot: jest.Mock
    proposedRuleHistory: jest.Mock
    proposedUserRule: jest.Mock
    proposedCampaignRule: jest.Mock
  }
  let actionOsAdoptionMetrics: { forWorkspace: jest.Mock }
  let controller: InternalTeamKpisController

  beforeEach(() => {
    service = {
      getTeams: jest.fn().mockResolvedValue({ windowDays: 30, teams: [], notes: [] }),
      getTeamDetail: jest.fn(),
    }
    chatbotFunnel = { overview: jest.fn().mockResolvedValue({ configured: false }) }
    messageLearningSignals = {
      expressSignals: jest.fn(),
      recordProposedRuleSnapshot: jest.fn().mockResolvedValue(null),
      proposedRuleHistory: jest.fn().mockResolvedValue([]),
      proposedUserRule: jest.fn().mockResolvedValue(null),
      proposedCampaignRule: jest.fn().mockResolvedValue(null),
    }
    actionOsAdoptionMetrics = {
      forWorkspace: jest.fn().mockResolvedValue({ validated: 0, executed: 0, disabled: 0, firstSuccessAt: null }),
    }
    const mesure = (value: number) => ({
      value,
      measurability: { measurable: true, observed: 12, required: 10, missing: 0 },
    })
    managerKpis = {
      activeCohortAtDay7: jest.fn().mockResolvedValue(mesure(0.4)),
      activeCohortAtDay30: jest.fn().mockResolvedValue(mesure(0.3)),
      retentionAtThreeMonths: jest.fn().mockResolvedValue(mesure(0.2)),
      bellumGrossMargin: jest.fn().mockResolvedValue(null),
      validatedActionCadence: jest.fn().mockResolvedValue([]),
      consultantsRegisteredByRep: jest.fn().mockResolvedValue([]),
    }
    controller = new InternalTeamKpisController(
      service as unknown as TeamKpisService,
      // Coûts fournisseurs (D19) — hors périmètre de cette suite.
      { overview: jest.fn() } as never,
      // Indicateurs de qualité (§12) — idem, testés dans leur propre suite.
      { overview: jest.fn().mockResolvedValue({ days: 30, indicators: [] }) } as never,
      // Couverture de l'enrichissement — sa logique est pure et testée à part
      // (`enrichment-coverage.spec.ts`).
      { overview: jest.fn() } as never,
      // Registre d'outils — le jeu de recette du copilote s'en sert pour
      // distinguer « bloqué » de « à jouer ».
      { list: jest.fn().mockResolvedValue([]) } as never,
      // Les neuf KPI CRM — leur calcul est pur et testé à part.
      { overview: jest.fn() } as never,
      // Les cinq indicateurs manager qui manquaient — testés à part
      // (`manager-kpi.spec.ts`, `manager-kpi.service.spec.ts`).
      managerKpis as never,
      // Le tunnel et les deux A/B du chatbot public — testés à part
      // (`chatbot-funnel.service.spec.ts`, `plausible-chatbot.client.spec.ts`).
      chatbotFunnel as never,
      // La rétention par cohorte d'espaces (#1658.1) — son calcul est pur et
      // testé à part (`retention-cohorts.spec.ts`, `.service.spec.ts`).
      { cohortes: jest.fn() } as never,
      // #2385.2/.5 — les signaux de learning et la persistance du candidat de
      // règle, testés à part (`message-learning-signals.spec.ts`,
      // `.service.spec.ts`).
      messageLearningSignals as never,
      // #2442.13 — action validée/exécutée/premier succès par espace, testée
      // à part (`action-os-adoption-metrics.spec.ts`, `.service.spec.ts`).
      actionOsAdoptionMetrics as never,
    )
  })

  it('#2442.13 — transmet le workspaceId et la fenêtre à ActionOsAdoptionMetricsService', async () => {
    actionOsAdoptionMetrics.forWorkspace.mockResolvedValueOnce({
      validated: 3,
      executed: 2,
      disabled: 1,
      firstSuccessAt: '2026-09-01T10:00:00.000Z',
    })
    const result = await controller.getActionOsAdoptionMetrics('ws-1', '7')
    expect(actionOsAdoptionMetrics.forWorkspace).toHaveBeenCalledWith('ws-1', 7)
    expect(result).toEqual({ validated: 3, executed: 2, disabled: 1, firstSuccessAt: '2026-09-01T10:00:00.000Z' })
  })

  it('rend le jeu de recette « à jouer », jamais « ça marche »', async () => {
    // `verdict: null` est la seule chose honnête qu'on puisse dire d'un cas non
    // observé. Lui prêter un PASS transformerait un jeu de recette en
    // attestation.
    const { cases } = await controller.getCopilotRecette('u-1')
    expect(cases.length).toBeGreaterThan(15)
    expect(cases.every(entry => entry.verdict === null || entry.verdict === 'BLOCKED')).toBe(true)
    expect(cases.every(entry => entry.observedMessage === null)).toBe(true)
  })

  it('marque BLOQUÉ ce dont la capacité manque, sans le faire jouer', async () => {
    const blocked = (await controller.getCopilotRecette('u-1')).cases.filter(entry => entry.verdict === 'BLOCKED')
    // Sans aucun connecteur, les cas qui exigent une messagerie ou un agenda
    // sont connus d'avance : les jouer ne prouverait rien.
    expect(blocked.length).toBeGreaterThan(0)
    expect(blocked.every(entry => entry.missing.length > 0)).toBe(true)
  })

  it('sans utilisateur, ne PRÉSUME aucune disponibilité', async () => {
    const { cases } = await controller.getCopilotRecette()
    expect(cases.every(entry => entry.missing.length === 0)).toBe(true)
    expect(cases.every(entry => entry.verdict === null)).toBe(true)
  })

  // #1946.14 — LE TEST DE L'APPELANT. Le moteur et le service ont chacun leur
  // suite ; sans celui-ci, un J+7 calculé et jamais renvoyé resterait vert
  // partout — c'est le défaut n°1 de ce dépôt.
  it('#1946.14 — la route manager-kpis rend l’usage à J+7 À CÔTÉ du J+30', async () => {
    const reponse = await controller.getManagerKpis()
    expect(managerKpis['activeCohortAtDay7']).toHaveBeenCalled()
    expect(Object.keys(reponse)).toContain('activeCohortAtDay7')
    expect(reponse.activeCohortAtDay7).toMatchObject({ value: 0.4 })
    expect(reponse.activeCohortAtDay30).toMatchObject({ value: 0.3 })
  })

  it('is guarded by InternalSecretGuard at the class level', () => {
    // Cross-tenant surface: losing the guard would expose every team's KPIs.
    const guards = Reflect.getMetadata('__guards__', InternalTeamKpisController) as unknown[]
    expect(guards).toContain(InternalSecretGuard)
  })

  it('parses the days query and delegates the summary', async () => {
    await controller.getTeams('7')
    expect(service.getTeams).toHaveBeenCalledWith(7)
  })

  it('leaves the window to the service default when days is omitted', async () => {
    await controller.getTeams(undefined)
    expect(service.getTeams).toHaveBeenCalledWith(undefined)
  })

  it('delegates the drill-down with the workspace id + parsed window', async () => {
    service.getTeamDetail.mockResolvedValueOnce({ workspace: { id: 'ws-1' } })
    await controller.getTeamDetail('ws-1', '90')
    expect(service.getTeamDetail).toHaveBeenCalledWith('ws-1', 90)
  })

  it('propagates a 404 from the workspace lookup', async () => {
    service.getTeamDetail.mockRejectedValueOnce(new NotFoundException())
    await expect(controller.getTeamDetail('ghost', undefined)).rejects.toThrow(NotFoundException)
  })

  it('délègue le tunnel du chatbot avec la période demandée', async () => {
    await controller.getChatbotFunnel('7d')
    expect(chatbotFunnel.overview).toHaveBeenCalledWith('7d')
  })

  it('laisse la période au défaut du service quand elle est omise ou vide', async () => {
    await controller.getChatbotFunnel(undefined)
    expect(chatbotFunnel.overview).toHaveBeenCalledWith(undefined)
    await controller.getChatbotFunnel('   ')
    expect(chatbotFunnel.overview).toHaveBeenCalledWith(undefined)
  })

  // #2385.5 (LOT écrivain 28/09, passe 2) — LE TEST DE L'APPELANT : sans lui,
  // un service qui persiste et un service qui lit resteraient verts sans
  // jamais être appelés par une route.
  it('POST .../proposed-rule/snapshot délègue l’enregistrement au service', async () => {
    messageLearningSignals.recordProposedRuleSnapshot.mockResolvedValueOnce({
      version: 1,
      status: 'proposed',
      summary: 'x',
      basedOnSample: 6,
      createdAt: '2026-09-28T00:00:00.000Z',
    })
    const result = await controller.postProposedMessageLearningRuleSnapshot('ws-1')
    expect(messageLearningSignals.recordProposedRuleSnapshot).toHaveBeenCalledWith('ws-1')
    expect(result?.version).toBe(1)
  })

  it('GET .../proposed-rule/history délègue la lecture au service', async () => {
    await controller.getProposedMessageLearningRuleHistory('ws-1')
    expect(messageLearningSignals.proposedRuleHistory).toHaveBeenCalledWith('ws-1')
  })

  // #2385.5 (LOT écrivain 28/09, passe 2) — le niveau UTILISATEUR.
  it('GET .../proposed-rule/user/:userId délègue au service, avec workspace ET utilisateur', async () => {
    await controller.getProposedUserMessageLearningRule('ws-1', 'u-1')
    expect(messageLearningSignals.proposedUserRule).toHaveBeenCalledWith('ws-1', 'u-1')
  })

  // #2385.5 (LOT écrivain 28/09, passe 2) — le niveau CAMPAGNE.
  it('GET .../proposed-rule/campaign/:campaignId délègue au service, avec workspace ET campagne', async () => {
    await controller.getProposedCampaignMessageLearningRule('ws-1', 'rentree-2026')
    expect(messageLearningSignals.proposedCampaignRule).toHaveBeenCalledWith('ws-1', 'rentree-2026')
  })
})

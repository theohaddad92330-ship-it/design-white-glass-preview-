import { NotFoundException } from '@nestjs/common'
import { AnalysisRunsService } from './analysis-runs.service'
import { AnalysisTelemetryService } from './analysis-telemetry.service'
import { InternalTelemetryController } from './internal-telemetry.controller'
import { IaClient } from '../ia/ia.client'
import { killSwitchById } from '../../common/kill-switches'

describe('InternalTelemetryController', () => {
  let telemetry: { getRecent: jest.Mock; getDetail: jest.Mock }
  let runs: { sourceHealthReport: jest.Mock }
  let ia: { killSwitches: jest.Mock; costMetrics: jest.Mock }
  let controller: InternalTelemetryController

  beforeEach(() => {
    telemetry = {
      getRecent: jest.fn().mockResolvedValue({ analyses: [], summary: { count: 0, totalCostUsd: 0, avgCostUsd: 0 } }),
      getDetail: jest.fn(),
    }
    runs = {
      sourceHealthReport: jest.fn().mockResolvedValue({ window: { hours: 24, runsConsidered: 0 }, sources: [] }),
    }
    ia = { killSwitches: jest.fn().mockResolvedValue(null), costMetrics: jest.fn().mockResolvedValue(null) }
    controller = new InternalTelemetryController(
      telemetry as unknown as AnalysisTelemetryService,
      runs as unknown as AnalysisRunsService,
      ia as unknown as IaClient,
    )
  })

  /**
   * Les interrupteurs d'arrêt (D169) — ce que la route doit dire, et ce qu'elle
   * ne doit JAMAIS dire.
   */
  describe('kill switches', () => {
    const ORIGINAL = { ...process.env }
    afterEach(() => {
      process.env = { ...ORIGINAL }
    })

    it('rend l’état des deux services et compte ce qui est coupé', async () => {
      process.env['ROUTINES_DISABLED'] = 'true'
      ia.killSwitches.mockResolvedValue({ 'analysis.grounding': true })

      const report = await controller.killSwitches()

      expect(report.switches.find(s => s.id === 'routines.sweep')?.state).toBe('cut')
      expect(report.switches.find(s => s.id === 'analysis.grounding')?.state).toBe('cut')
      expect(report.summary.cut).toBe(2)
      expect(report.iaReachable).toBe(true)
    })

    it('rend `unknown` — jamais `active` — quand le moteur ne répond pas', async () => {
      ia.killSwitches.mockResolvedValue(null)

      const report = await controller.killSwitches()

      // « Non mesuré n'est jamais 0 » : un moteur muet ne prouve pas que ses
      // capacités tournent. C'est le motif du `200 {"status":"degraded"}`
      // compté `operational` — ce qui rend une panne invisible.
      expect(report.switches.filter(s => s.service === 'ia').every(s => s.state === 'unknown')).toBe(true)
      expect(report.iaReachable).toBe(false)
      expect(report.summary.unknown).toBeGreaterThanOrEqual(8)
    })

    it('ne publie aucun nom de variable d’environnement', async () => {
      process.env['CRM_SYNC_DISABLED'] = 'true'
      const report = await controller.killSwitches()
      expect(JSON.stringify(report)).not.toMatch(/_DISABLED/)
      // Témoin positif : la charge utile n'est pas vide, donc l'absence a un sens.
      expect(report.switches.length).toBeGreaterThanOrEqual(23)
    })

    /**
     * LOT 13 — DÉFAUT B (D169) : `RAG_LLM_RERANK_DISABLED` fonctionne depuis
     * GA-304 (`rag_knowledge.py`) mais n'avait AUCUNE surface — posé pendant un
     * incident, rien ne le disait. La capacité rejoint le registre partagé
     * (`CAPABILITY_KILL_SWITCHES` côté moteur, `IA_KILL_SWITCHES` ici) sous
     * l'identifiant `rag.llm_rerank`, joint comme toute autre capacité IA :
     * `unknown` moteur injoignable, jamais `active` sans mesure.
     */
    it('joint « rag.llm_rerank » — nouvellement au registre — comme toute autre capacité IA', async () => {
      ia.killSwitches.mockResolvedValue(null)
      const unreachable = await controller.killSwitches()
      const unknownRow = unreachable.switches.find(s => s.id === 'rag.llm_rerank')
      expect(unknownRow).toBeDefined()
      expect(unknownRow?.service).toBe('ia')
      // « Non mesuré n'est jamais 0 » : moteur muet ⇒ `unknown`, jamais `active`.
      expect(unknownRow?.state).toBe('unknown')

      ia.killSwitches.mockResolvedValue({ 'rag.llm_rerank': true })
      const cut = await controller.killSwitches()
      expect(cut.switches.find(s => s.id === 'rag.llm_rerank')?.state).toBe('cut')

      ia.killSwitches.mockResolvedValue({ 'rag.llm_rerank': false })
      const active = await controller.killSwitches()
      expect(active.switches.find(s => s.id === 'rag.llm_rerank')?.state).toBe('active')
    })

    /**
     * LOT 13 — DÉFAUT A, REVIREMENT (D169) : un premier passage avait constaté
     * que seule `ground_facts_v2` écoutait `GROUNDING_DISABLED` (`cite_key_facts`,
     * la passe B3+ qui alimente `sources.citations`, n'en avait aucune) et
     * avait choisi de le DIRE plutôt que de le corriger (libellé « (v2) »).
     * Louis a tranché : étendre la garde aux deux passes — un interrupteur
     * d'incident doit couper ce que son nom annonce. Le libellé « (v2) » et la
     * mention « la passe B3+ continue de tourner » sont donc redevenus FAUX ;
     * ce test verrouille le libellé corrigé, pas l'ancien.
     */
    it('le libellé du grounding ne distingue plus « v2 » — les deux passes s’arrêtent', () => {
      const grounding = killSwitchById('analysis.grounding')
      expect(grounding.labelFr.toLowerCase()).not.toContain('v2')
      expect(grounding.labelEn.toLowerCase()).not.toContain('v2')
      expect(grounding.labelFr).toBe('Sourçage des faits')
      expect(grounding.labelEn).toBe('Fact sourcing')
      // Les deux passes de citations (B3+ et v2) s'arrêtent désormais — le
      // texte opérateur ne doit plus dire que l'une des deux continue.
      expect(grounding.cutsFr.toLowerCase()).not.toMatch(/n.a pas d.interrupteur|continue de tourner/)
      expect(grounding.cutsEn.toLowerCase()).not.toMatch(/no dedicated switch|keeps running/)
    })
  })

  /**
   * GA-305 — LOT 10 : `GET /metrics/cost` (moteur IA) existait sans aucun
   * appelant. Cette route est le premier. Le point qui compte le plus : un
   * moteur muet rend `reachable: false` et un total ABSENT, jamais `0` — les
   * deux se liraient pareil sur un écran naïf, et pourtant l'un dit « rien
   * dépensé » et l'autre « on ne sait pas ».
   */
  describe('cost metrics', () => {
    it('rend les compteurs quand le moteur répond, triés tels que l’IA les a rendus', async () => {
      ia.costMetrics.mockResolvedValue({
        prompts: [
          {
            prompt: 'bellum_chat',
            calls: 5,
            inputTokens: 2000,
            outputTokens: 900,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            costUsd: 0.05,
            model: 'claude-sonnet-5',
            unpricedCalls: 0,
          },
        ],
        totalCostUsd: 0.05,
        truncations: {},
      })

      const report = await controller.costMetrics()

      expect(report.reachable).toBe(true)
      expect(report.totalCostUsd).toBe(0.05)
      expect(report.prompts).toHaveLength(1)
      expect(report.prompts[0]?.prompt).toBe('bellum_chat')
    })

    // Témoin positif : un process qui vient de démarrer et n'a RÉELLEMENT
    // rien coûté doit pouvoir dire 0 — sinon la garde ci-dessous attraperait
    // un cas qu'elle ne vise pas.
    it('rend un total à ZÉRO — un vrai zéro — quand le moteur répond et n’a rien dépensé', async () => {
      ia.costMetrics.mockResolvedValue({ prompts: [], totalCostUsd: 0, truncations: {} })

      const report = await controller.costMetrics()

      expect(report.reachable).toBe(true)
      expect(report.totalCostUsd).toBe(0)
      expect(report.prompts).toEqual([])
    })

    it('rend `reachable: false` et un total ABSENT — jamais `0` — quand le moteur ne répond pas', async () => {
      ia.costMetrics.mockResolvedValue(null)

      const report = await controller.costMetrics()

      // « Non mesuré n'est jamais 0 » : un moteur muet ne prouve pas que la
      // facture est nulle. `0` et « injoignable » doivent rester DISTINGUABLES
      // — c'est le seul fait que cette route existe pour établir.
      expect(report.reachable).toBe(false)
      expect(report.totalCostUsd).not.toBe(0)
      expect(report.totalCostUsd).toBeNull()
      expect(report.prompts).toEqual([])
    })
  })

  describe('source health', () => {
    it('delegates with no window by default', async () => {
      await controller.sourceHealth()
      expect(runs.sourceHealthReport).toHaveBeenCalledWith(undefined)
    })

    it('parses a numeric window', async () => {
      await controller.sourceHealth('72')
      expect(runs.sourceHealthReport).toHaveBeenCalledWith(72)
    })

    it('falls back to the default window on a non-numeric value', async () => {
      await controller.sourceHealth('abc')
      expect(runs.sourceHealthReport).toHaveBeenCalledWith(undefined)
    })

    it('does not get swallowed by the :accountId route', async () => {
      // ``source-health`` is a literal path on a controller that also declares
      // ``:accountId``. If the param route won, this call would 404 instead of
      // returning a report — a silent regression the moment someone reorders
      // the methods.
      const report = await controller.sourceHealth()
      expect(report.sources).toEqual([])
      expect(telemetry.getDetail).not.toHaveBeenCalled()
    })
  })

  it('delegates with no limit by default', async () => {
    await controller.list()
    expect(telemetry.getRecent).toHaveBeenCalledWith(undefined)
  })

  it('parses a numeric limit', async () => {
    await controller.list('25')
    expect(telemetry.getRecent).toHaveBeenCalledWith(25)
  })

  it('falls back to default on a non-numeric limit', async () => {
    await controller.list('abc')
    expect(telemetry.getRecent).toHaveBeenCalledWith(undefined)
  })

  it('returns the detail for a known account', async () => {
    telemetry.getDetail.mockResolvedValueOnce({ accountId: 'a1', companyName: 'SNCF' })
    const detail = await controller.detail('a1')
    expect(telemetry.getDetail).toHaveBeenCalledWith('a1')
    expect(detail).toMatchObject({ accountId: 'a1' })
  })

  it('throws 404 when the account is unknown', async () => {
    telemetry.getDetail.mockResolvedValueOnce(null)
    await expect(controller.detail('ghost')).rejects.toThrow(NotFoundException)
  })
})

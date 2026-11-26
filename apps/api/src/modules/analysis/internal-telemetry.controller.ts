import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { killSwitchReport, type KillSwitchReport } from '../../common/kill-switches'
import { IaClient, type IaCostMetrics } from '../ia/ia.client'
import { AnalysisRunsService } from './analysis-runs.service'
import { AnalysisTelemetryService, type TelemetryDetail, type TelemetryReport } from './analysis-telemetry.service'
import type { SourceHealthReport } from './source-health'

/**
 * Charge utile de `GET /internal/telemetry/cost`. Non exportée : seule cette
 * classe la construit et la rend (knip — un type exporté et consommé dans son
 * seul fichier ne s'exporte pas).
 *
 * ⚠️ `totalCostUsd` est `null`, jamais `0`, quand `reachable` est `false` —
 * les deux ne doivent JAMAIS pouvoir se confondre à la lecture.
 */
type CostMetricsReport = {
  reachable: boolean
  prompts: IaCostMetrics['prompts']
  totalCostUsd: number | null
  truncations: IaCostMetrics['truncations']
  measuredAt: string
}

/**
 * Operator monitoring endpoint for the telemetry dashboard. Behind
 * ``InternalSecretGuard`` (header secret) — no end-user JWT, returns data
 * across all tenants, so it must never be exposed without the guard.
 */
@Controller('internal/telemetry')
@UseGuards(InternalSecretGuard)
export class InternalTelemetryController {
  constructor(
    private readonly telemetry: AnalysisTelemetryService,
    private readonly runs: AnalysisRunsService,
    private readonly ia: IaClient,
  ) {}

  /**
   * Quelles capacités sont COUPÉES en ce moment — les deux services d'un coup.
   *
   * Le trou que ça bouche (D169) : vingt-trois interrupteurs d'arrêt existaient
   * sans AUCUNE surface, ni client ni opérateur. Posé pendant un incident, un
   * interrupteur ne se voyait nulle part — et six d'entre eux ne laissaient pas
   * même une ligne de journal. « Un interrupteur qu'on oublie d'éteindre est
   * indistinguable d'un produit qui n'a jamais su faire. »
   *
   * ⚠️ Déclarée AVANT ``:accountId``, comme ``source-health`` : Nest apparie les
   * routes dans l'ordre, et une déclaration plus bas serait avalée par la route
   * à paramètre — le chemin rendrait un 404 « Analysis kill-switches not found ».
   *
   * ⚠️ Aucun nom de variable, aucune valeur d'environnement ne traverse cette
   * route. Ce qui sort est l'ÉTAT d'une CAPACITÉ, avec son libellé produit.
   * Gardé par **GA-85**.
   *
   * ⚠️ Le moteur IA vit dans un autre process : quand il ne répond pas, ses huit
   * capacités valent ``unknown`` et jamais ``active``. ``iaReachable: false`` le
   * dit à l'écran, qui doit le RENDRE plutôt que de peindre huit lignes en vert.
   */
  @Get('kill-switches')
  async killSwitches(): Promise<KillSwitchReport> {
    return killSwitchReport({ ia: await this.ia.killSwitches() })
  }

  @Get()
  list(@Query('limit') limit?: string): Promise<TelemetryReport> {
    const parsed = limit ? Number.parseInt(limit, 10) : NaN
    return this.telemetry.getRecent(Number.isFinite(parsed) ? parsed : undefined)
  }

  /**
   * Per-source health across the recent runs — "which source, since when, why".
   *
   * Declared BEFORE ``:accountId`` on purpose: Nest matches routes in order, so
   * a later declaration would be swallowed by the param route and this path
   * would 404 with "Analysis source-health not found".
   */
  @Get('source-health')
  sourceHealth(@Query('hours') hours?: string): Promise<SourceHealthReport> {
    const parsed = hours ? Number.parseInt(hours, 10) : NaN
    return this.runs.sourceHealthReport(Number.isFinite(parsed) ? parsed : undefined)
  }

  /**
   * LOT 10 — ce que chaque prompt IA a coûté depuis le démarrage du process
   * FastAPI. `GET /metrics/cost` (`apps/ia/app/main.py`) existait, répondait
   * à la bonne question — « qu'est-ce qui coûte cher hors pipeline
   * d'analyse : Copilote, discover, battlecard, weekly, compare, icebreaker,
   * message, summary, scorer, activity » — et n'avait AUCUN appelant dans les
   * trois applications. La famille n°1 de ce dépôt (« du code juste, calculé,
   * testé, que personne n'appelle ») appliquée à son propre instrument de
   * mesure.
   *
   * ⚠️ Déclarée AVANT ``:accountId``, comme ``kill-switches`` et
   * ``source-health`` juste au-dessus : Nest apparie les routes dans l'ordre,
   * une déclaration plus bas serait avalée par la route à paramètre et ce
   * chemin rendrait un 404 trompeur (« Analysis cost not found »). Gardé par
   * **GA-306**.
   *
   * ⚠️ Le moteur IA vit dans un autre process : quand il ne répond pas, cette
   * route rend `reachable: false` et un total ABSENT (`null`) — jamais `0`.
   * Un moteur muet ne prouve pas que la facture est nulle ; ce serait le
   * « non mesuré affiché zéro » transposé au coût. Gardé par **GA-305**.
   *
   * ⚠️ Compteurs EN MÉMOIRE DU PROCESS IA : ils repartent de zéro à chaque
   * redéploiement et ne sont PAS agrégés entre replicas — voulu, documenté
   * sur la route elle-même côté moteur. Un ordre de grandeur lisible en
   * direct, pas une comptabilité — l'écran le dit.
   */
  @Get('cost')
  async costMetrics(): Promise<CostMetricsReport> {
    const ia = await this.ia.costMetrics()
    return {
      reachable: ia !== null,
      prompts: ia?.prompts ?? [],
      totalCostUsd: ia ? ia.totalCostUsd : null,
      truncations: ia?.truncations ?? {},
      measuredAt: new Date().toISOString(),
    }
  }

  @Get(':accountId')
  async detail(@Param('accountId') accountId: string): Promise<TelemetryDetail> {
    const detail = await this.telemetry.getDetail(accountId)
    if (!detail) {
      throw new NotFoundException(`Analysis ${accountId} not found`)
    }
    return detail
  }
}

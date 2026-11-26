import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import type { MarketMemoryGroundTruthJudgment, MarketMemoryGroundTruthMetrics } from '@bellum/contracts'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { GroundTruthJudgmentInputDto } from './dto/ground-truth-judgment-input.dto'
import { GroundTruthLookupQueryDto } from './dto/ground-truth-lookup-query.dto'
import { MarketMemoryGroundTruthService } from './market-memory-ground-truth.service'
import type { MarketMemoryGroundTruthReaderResult } from './module-tokens'

const DEFAULT_JUDGED_BY = 'backoffice'

/**
 * #1622 — L'OUTILLAGE DE VÉRITÉ TERRAIN, la PORTE.
 *
 * Même patron que {@link AdminQueuesController} / {@link
 * AdminAnalysesController} : préfixe `internal/admin`, `InternalSecretGuard`
 * (en-tête `x-internal-secret`, aucun JWT utilisateur — c'est un outil
 * d'EXPLOITATION, appelé par le proxy serveur du back-office, jamais par un
 * navigateur directement). Retirer le garde exposerait la vérité terrain, et
 * ses jugements, à quiconque atteint l'API.
 *
 * `judgedBy` est un champ du CORPS, comme `QueueActorDto.actor`
 * (`admin-queues.controller.ts`) : le proxy `dashboard-manager` le renseigne
 * depuis la session de l'opérateur (`actorFromRequest`) AVANT d'appeler
 * cette route — jamais tapé par l'opérateur lui-même, jamais dérivé de
 * l'en-tête `x-internal-secret` qui ne porte aucune identité.
 */
@Controller('internal/admin/market-memory-ground-truth')
@UseGuards(InternalSecretGuard)
export class MarketMemoryGroundTruthController {
  constructor(private readonly groundTruth: MarketMemoryGroundTruthService) {}

  /** Aperçu SEUL de la lecture mémoire marché — n'enregistre rien. */
  @Get('lookup')
  lookup(@Query() query: GroundTruthLookupQueryDto): Promise<MarketMemoryGroundTruthReaderResult> {
    return this.groundTruth.previewReading(query)
  }

  @Get('judgments')
  listJudgments(): Promise<MarketMemoryGroundTruthJudgment[]> {
    return this.groundTruth.listCurrentJudgments()
  }

  @Post('judgments')
  submitJudgment(@Body() body: GroundTruthJudgmentInputDto): Promise<MarketMemoryGroundTruthJudgment> {
    const { judgedBy, ...input } = body
    return this.groundTruth.submitJudgment(input, judgedBy?.trim() || DEFAULT_JUDGED_BY)
  }

  @Get('metrics')
  metrics(): Promise<MarketMemoryGroundTruthMetrics> {
    return this.groundTruth.computeMetrics()
  }
}

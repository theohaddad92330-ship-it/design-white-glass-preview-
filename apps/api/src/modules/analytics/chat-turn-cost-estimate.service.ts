import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ChatTurnCostSampleEntity } from '../../database/entities/chat-turn-cost-sample.entity'

/** Fenêtre de lecture — les N dernières mesures du palier, jamais tout l'historique. */
const SAMPLE_WINDOW = 50

/** En dessous de ce nombre, `estimate()` rend `null` (non mesuré ≠ 0). */
const MIN_SAMPLES_FOR_ESTIMATE = 5

type ChatTurnCostEstimate = {
  tier: 'fast' | 'deep'
  durationMs: number
  sampleSize: number
  /** Union plutôt que `avgCostUsd: number | null` — même raison que `ProviderCostDay` :
   *  un lecteur qui écrirait `avgCostUsd ?? 0` annoncerait un prix qui n'a jamais été mesuré. */
  cost: { measured: true; avgCostUsd: number } | { measured: false }
}

/**
 * #2448.8 / #2882.11 (épopée #2882) — ce que `ResearchModeSelector` lit pour
 * annoncer coût et durée AVANT de lancer un tour Vérifié/Approfondi.
 *
 * Même patron que `EnrichmentDurationService` (#2120.57 / #2297.23) : la
 * MÉDIANE pour la durée (insensible à une cascade exceptionnelle), `null`
 * sous {@link MIN_SAMPLES_FOR_ESTIMATE} mesures (GA-18/GA-19). Le coût
 * diffère : c'est une MOYENNE des seules lignes TARIFÉES de la fenêtre — une
 * fenêtre sans aucune ligne tarifée rend `cost.measured === false`, jamais un
 * `0` qui prétendrait avoir mesuré un prix nul.
 */
@Injectable()
export class ChatTurnCostEstimateService {
  private readonly logger = new Logger(ChatTurnCostEstimateService.name)

  constructor(
    @InjectRepository(ChatTurnCostSampleEntity)
    private readonly samples: Repository<ChatTurnCostSampleEntity>,
  ) {}

  /** Best-effort, comme `ProviderCostService.record` : une ligne manquée ne doit jamais faire échouer un tour. */
  async record(tier: 'fast' | 'deep', durationMs: number, costUsd: number | null): Promise<void> {
    if (durationMs < 0) return
    try {
      await this.samples.insert({
        tier,
        duration_ms: Math.round(durationMs),
        cost_usd: costUsd === null ? null : String(costUsd),
      })
    } catch (error) {
      this.logger.warn('Chat turn cost not recorded', { error })
    }
  }

  async estimate(tier: 'fast' | 'deep'): Promise<ChatTurnCostEstimate | null> {
    const rows = await this.samples.find({
      where: { tier },
      order: { measured_at: 'DESC' },
      take: SAMPLE_WINDOW,
    })
    if (rows.length < MIN_SAMPLES_FOR_ESTIMATE) return null

    const durations = rows.map(row => row.duration_ms).sort((a, b) => a - b)
    const mid = Math.floor(durations.length / 2)
    const durationMs =
      durations.length % 2 === 0 ? Math.round((durations[mid - 1]! + durations[mid]!) / 2) : durations[mid]!

    const priced = rows.flatMap(row => (row.cost_usd === null ? [] : [Number(row.cost_usd)]))
    const cost: ChatTurnCostEstimate['cost'] =
      priced.length === 0
        ? { measured: false }
        : {
            measured: true,
            avgCostUsd: Math.round((priced.reduce((sum, v) => sum + v, 0) / priced.length) * 10_000) / 10_000,
          }

    return { tier, durationMs, sampleSize: rows.length, cost }
  }
}

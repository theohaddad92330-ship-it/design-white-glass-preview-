import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type {
  MarketMemoryGroundTruthJudgment,
  MarketMemoryGroundTruthJudgmentInput,
  MarketMemoryGroundTruthMetrics,
} from '@bellum/contracts'
import { MarketMemoryGroundTruthJudgmentEntity } from '../../database/entities/market-memory-ground-truth-judgment.entity'
import { computeMarketMemoryGroundTruthMetrics } from './market-memory-ground-truth-metrics'
import {
  MARKET_MEMORY_GROUND_TRUTH_READER,
  type MarketMemoryGroundTruthLookup,
  type MarketMemoryGroundTruthReader,
  type MarketMemoryGroundTruthReaderResult,
} from './module-tokens'

/**
 * #1622 — L'OUTILLAGE DE VÉRITÉ TERRAIN, la LOGIQUE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE SERVICE FAIT, ET CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il enregistre un jugement humain (`submitJudgment`), liste les jugements
 * COURANTS (`listCurrentJudgments`) et calcule les six métriques
 * (`computeMetrics`) — toujours à partir de la MÊME requête
 * (`currentJudgmentRows`), pour que la table affichée à l'écran et les
 * métriques calculées ne puissent jamais diverger sur « quel est le jugement
 * actuel de ce cas ».
 *
 * Il ne juge JAMAIS lui-même : `submitJudgment` ne fait qu'enregistrer un
 * label que l'opérateur a choisi. Il n'appelle JAMAIS directement les cinq
 * tables de la mémoire marché (GA-258) : toute lecture passe par le port
 * {@link MARKET_MEMORY_GROUND_TRUTH_READER} (`module-tokens.ts`), composé dans
 * `market-memory-ground-truth.module.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AJOUT SEULEMENT — LE JUGEMENT COURANT D'UN CAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Une correction humaine gagne toujours, quelle que soit sa date : ce service
 * n'UPDATE jamais une ligne, il en insère une nouvelle avec `judged_at` plus
 * récent. Le jugement COURANT d'un cas (`case_key`) est calculé en UN SEUL
 * endroit (`currentJudgmentRows`, `DISTINCT ON (case_key) ORDER BY judged_at
 * DESC`) — jamais recalculé différemment par le service et l'écran, sinon les
 * deux divergeraient le jour d'une révision.
 */
@Injectable()
export class MarketMemoryGroundTruthService {
  constructor(
    @InjectRepository(MarketMemoryGroundTruthJudgmentEntity)
    private readonly judgments: Repository<MarketMemoryGroundTruthJudgmentEntity>,
    @Inject(MARKET_MEMORY_GROUND_TRUTH_READER)
    private readonly reader: MarketMemoryGroundTruthReader,
  ) {}

  /** Aperçu SEUL — n'écrit rien. C'est ce que l'écran interroge pendant que
   *  l'opérateur tape encore le nom du compte et de l'ESN. */
  async previewReading(lookup: MarketMemoryGroundTruthLookup): Promise<MarketMemoryGroundTruthReaderResult> {
    return this.reader(lookup)
  }

  /**
   * Enregistre un jugement — un des six boutons de l'écran.
   *
   * ⚠️ Si la mémoire marché est INDISPONIBLE au moment de juger, ce service
   * REFUSE d'enregistrer : écrire `hadReading: false` sur une panne de lecture
   * mentirait — « la mémoire ne connaît pas ce couple » alors que la vraie
   * réponse est « on n'a pas pu lire ». Le même principe que
   * `MarketMemoryService` applique déjà à ses propres lecteurs.
   */
  async submitJudgment(
    input: MarketMemoryGroundTruthJudgmentInput,
    judgedBy: string,
  ): Promise<MarketMemoryGroundTruthJudgment> {
    const accountWebsite = input.accountWebsite?.trim() || null
    const accountCountry = input.accountCountry?.trim() || null
    const accountName = input.accountName.trim()
    const esnName = input.esnName.trim()

    const result = await this.reader({ accountName, accountWebsite, accountCountry, esnName })
    if (result.status === 'unavailable') {
      throw new ServiceUnavailableException(
        `observations du marché indisponibles (${result.reason}) — jugement non enregistré, réessaie`,
      )
    }

    const entity = this.judgments.create({
      caseKey: buildGroundTruthCaseKey({ accountName, accountWebsite, esnName }),
      accountName,
      accountWebsite,
      accountCountry,
      esnName,
      hadReading: result.reading.hadReading,
      readingRank: result.reading.rank,
      readingPersons: result.reading.persons,
      readingCertainty: result.reading.certainty,
      label: input.label,
      judgedBy: judgedBy.trim(),
    })
    const saved = await this.judgments.save(entity)
    return toApiJudgment(saved)
  }

  async listCurrentJudgments(): Promise<MarketMemoryGroundTruthJudgment[]> {
    const rows = await this.currentJudgmentRows()
    return rows.map(toApiJudgment)
  }

  async computeMetrics(): Promise<MarketMemoryGroundTruthMetrics> {
    const rows = await this.currentJudgmentRows()
    return computeMarketMemoryGroundTruthMetrics(rows)
  }

  /**
   * LA dérivation unique de « quel est le jugement actuel de ce cas » — un
   * `DISTINCT ON` Postgres sur `case_key`, ordonné par `judged_at` décroissant.
   * Toute lecture qui a besoin des jugements « d'aujourd'hui » passe par ICI,
   * jamais par une requête `find()` brute qui rendrait l'historique complet
   * (archivé compris).
   */
  private async currentJudgmentRows(): Promise<MarketMemoryGroundTruthJudgmentEntity[]> {
    return this.judgments
      .createQueryBuilder('j')
      .distinctOn(['j.case_key'])
      .orderBy('j.case_key', 'ASC')
      .addOrderBy('j.judged_at', 'DESC')
      .getMany()
  }
}

function normalizeForCaseKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * La clé qui regroupe les jugements d'UN MÊME cas — indépendante de
 * `marketMatchKey` (`market-memory/market-company-key.ts`) à dessein : elle ne
 * groupe QUE ce que l'opérateur a tapé pour désigner son cas, elle ne
 * rapproche rien au corpus. Le rapprochement lui-même reste entièrement
 * délégué au port de lecture (GA-258).
 *
 * ⚠️ Le pays n'entre PAS dans la clé : une correction du pays déclaré pour un
 * compte déjà jugé reste le MÊME cas — recalculer une clé différente à chaque
 * précision de métadonnée ferait perdre l'historique de révision d'un cas pour
 * un détail qui ne change pas son identité.
 */
export function buildGroundTruthCaseKey(input: {
  accountName: string
  accountWebsite?: string | null
  esnName: string
}): string {
  return [
    normalizeForCaseKey(input.accountName),
    normalizeForCaseKey(input.accountWebsite),
    normalizeForCaseKey(input.esnName),
  ].join('::')
}

function toApiJudgment(entity: MarketMemoryGroundTruthJudgmentEntity): MarketMemoryGroundTruthJudgment {
  return {
    id: entity.id,
    case: {
      accountName: entity.accountName,
      accountWebsite: entity.accountWebsite,
      accountCountry: entity.accountCountry,
      esnName: entity.esnName,
    },
    reading: {
      hadReading: entity.hadReading,
      rank: entity.readingRank,
      persons: entity.readingPersons,
      certainty: entity.readingCertainty as MarketMemoryGroundTruthJudgment['reading']['certainty'],
    },
    label: entity.label as MarketMemoryGroundTruthJudgment['label'],
    judgedBy: entity.judgedBy,
    judgedAt: entity.judgedAt.toISOString(),
  }
}

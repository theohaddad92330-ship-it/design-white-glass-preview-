import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpClient } from '@bellum/http'
import type { QualificationCriterion } from '@bellum/contracts'

/**
 * #3755.3 — le client vers `POST /qualification/evaluate` du service IA, qui
 * évalue chaque critère de la grille AVEC SA PREUVE à partir du dossier.
 *
 * Même forme que `need-compile-text.service.ts` : un `HttpClient` dédié, l'en-tête
 * `x-internal-secret`, aucune retentative (un appel payant réussi dont la réponse
 * se perd ne doit pas en déclencher un second). Une panne de transport rend
 * `unavailable` — jamais une évaluation inventée.
 */
type QualificationEvaluationRequest = {
  accountName: string
  dossier: Record<string, unknown>
  criteria: QualificationCriterion[]
  signals: { tier: string | null; decision_level: string | null }
}

type QualificationEvaluationResult = { status: 'ok'; evaluations: unknown } | { status: 'unavailable'; error: string }

export interface QualificationEvaluatorPort {
  evaluate(request: QualificationEvaluationRequest): Promise<QualificationEvaluationResult>
}

type Envelope = { success: boolean; data: { evaluations?: unknown } }

@Injectable()
export class QualificationEvaluatorClient implements QualificationEvaluatorPort {
  private readonly logger = new Logger(QualificationEvaluatorClient.name)
  private readonly http: HttpClient

  constructor(config: ConfigService) {
    const internalSecret = config.get<string>('internalApiSecret')
    const logger = this.logger
    this.http = new HttpClient({
      baseUrl: config.get<string>('iaServiceUrl', 'http://localhost:8000'),
      logger: {
        log: (message, meta) => logger.log(message, meta),
        warn: (message, meta) => logger.warn(message, meta),
      },
      defaultHeaders: internalSecret ? { 'x-internal-secret': internalSecret } : {},
      defaultTimeoutMs: 60_000,
      defaultMaxAttempts: 1,
    })
  }

  async evaluate(request: QualificationEvaluationRequest): Promise<QualificationEvaluationResult> {
    try {
      const envelope = await this.http.request<Envelope>({
        urlInfo: { template: '/qualification/evaluate' },
        body: {
          account_name: request.accountName,
          dossier: request.dossier,
          criteria: request.criteria,
          signals: request.signals,
        },
      })
      return { status: 'ok', evaluations: envelope.data?.evaluations ?? [] }
    } catch (error) {
      // Classe d'erreur seulement : le message peut citer le dossier.
      this.logger.warn(`Évaluation de la grille indisponible : ${(error as Error).name}`)
      return { status: 'unavailable', error: 'Le service d’évaluation est indisponible pour le moment.' }
    }
  }
}

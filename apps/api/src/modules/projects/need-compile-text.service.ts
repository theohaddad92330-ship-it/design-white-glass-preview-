import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpClient } from '@bellum/http'
import type { CompiledNeed } from '@bellum/contracts'

/**
 * LA COMPILATION D'UN BESOIN DEPUIS UN TEXTE COLLÉ — le client vers le
 * service IA (#2939, #2174.3/.5).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE À CÔTÉ DE `modules/ia/ia.client.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * Même raison que `modules/expenses/expense-extraction.service.ts` et
 * `modules/delivery/mission-extraction.service.ts` : un client dédié,
 * minuscule, construit avec le MÊME `HttpClient` réutilisable (`@bellum/http`)
 * et le même en-tête `x-internal-secret`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE PANNE DE TRANSPORT N'EST PAS UN STATUT MÉTIER
 * ─────────────────────────────────────────────────────────────────────────────
 * Le service IA rend `{ compiled, dropped }` ou `{ error }` — jamais une
 * exception pour un motif métier (`compile_need` refuse un tableur, une
 * source illisible, un besoin vide, tout SANS lever). Une exception ne peut
 * donc venir que du TRANSPORT : elle est traduite en `status: 'unavailable'`,
 * jamais confondue avec l'`error` métier — l'écran de l'étape 1 doit pouvoir
 * dire « le service est indisponible, continue à la main » plutôt que
 * « ce texte ne se compile pas ».
 *
 * Aucune retentative côté client (`defaultMaxAttempts: 1`) — même raison que
 * ses deux voisins : un appel qui a RÉUSSI côté IA mais dont la réponse se
 * perd en route ne doit pas déclencher un second appel payant.
 */
export type NeedCompileTextResult =
  | { status: 'ok'; compiled: CompiledNeed; dropped: { field: string; reason: string }[] }
  | { status: 'refused'; error: string }
  | { status: 'unavailable'; error: string }

type NeedCompileTextEnvelope = {
  success: boolean
  data: { compiled: CompiledNeed; dropped: { field: string; reason: string }[] } | { error: string }
}

@Injectable()
export class NeedCompileTextService {
  private readonly logger = new Logger(NeedCompileTextService.name)
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
      defaultTimeoutMs: 30_000,
      defaultMaxAttempts: 1,
    })
  }

  /**
   * Compile un brief ou un e-mail collé — jamais une écriture. `refused`
   * couvre ce que `compile_need` refuse pour une raison MÉTIER (source
   * illisible, tableur, besoin vide) ; `unavailable` couvre le TRANSPORT.
   */
  async compileText(text: string, sourceKind: 'free_brief' | 'email'): Promise<NeedCompileTextResult> {
    try {
      const envelope = await this.http.request<NeedCompileTextEnvelope>({
        urlInfo: { template: '/needs/compile-text' },
        body: { text, source_kind: sourceKind },
      })
      if ('error' in envelope.data) return { status: 'refused', error: envelope.data.error }
      return { status: 'ok', compiled: envelope.data.compiled, dropped: envelope.data.dropped }
    } catch (error) {
      this.logger.warn(`Compilation de besoin indisponible : ${(error as Error).message}`)
      return { status: 'unavailable', error: 'Le service de compilation est indisponible pour le moment.' }
    }
  }
}

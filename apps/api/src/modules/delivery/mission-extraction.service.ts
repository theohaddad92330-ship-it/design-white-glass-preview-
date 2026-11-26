import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpClient } from '@bellum/http'

/**
 * LA LECTURE AUTOMATIQUE D'UN DOCUMENT DE MISSION — le client vers le service
 * IA (#2560).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE À CÔTÉ DE `modules/ia/ia.client.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * Même raison que `modules/expenses/expense-extraction.service.ts` : un
 * client dédié, minuscule, construit avec le MÊME `HttpClient` réutilisable
 * (`@bellum/http`) et le même en-tête `x-internal-secret`, évite de toucher un
 * fichier partagé par une dizaine de domaines pour une seule route.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE PANNE DE TRANSPORT N'EST PAS UN STATUT MÉTIER
 * ─────────────────────────────────────────────────────────────────────────────
 * Le service IA rend toujours l'un de ses TROIS statuts nommés (`ok`,
 * `unreadable`, `too_large`) — jamais une exception pour un motif métier. Ici,
 * une exception ne peut venir que du TRANSPORT (réseau, timeout, 5xx) : elle
 * est traduite en un QUATRIÈME statut, `unavailable`, propre à cette couche —
 * la confondre avec un statut métier transformerait une panne passagère en un
 * renoncement permanent affiché à l'écran.
 *
 * Aucune retentative côté client (`defaultMaxAttempts: 1`) : un appel qui a
 * RÉUSSI côté IA (le modèle a répondu, le coût est déjà engagé) mais dont la
 * réponse se perd en route ne doit pas déclencher un second appel payant —
 * l'utilisateur peut toujours retenter lui-même en rouvrant le dialogue.
 */
type MissionExtractionStatus = 'ok' | 'unreadable' | 'too_large' | 'unavailable'

type MissionFieldProposal<T> = {
  value: T | null
  confidence: number
  sourceExcerpt: string
}

export type MissionExtraction = {
  status: MissionExtractionStatus
  /** `null` = aucun appel de modèle n'a eu lieu, ou son tarif est inconnu — jamais un coût à zéro. */
  costUsd: number | null
  fields: {
    accountName: MissionFieldProposal<string>
    roleTitle: MissionFieldProposal<string>
    startedOn: MissionFieldProposal<string>
    endsOn: MissionFieldProposal<string>
    dailyRate: MissionFieldProposal<number>
    days: MissionFieldProposal<number>
    /** X66 / #3547 — `supervised` seulement si le document le dit, cité ; sinon `null`. */
    supervisedForfait: MissionFieldProposal<'supervised'>
  }
}

type MissionExtractionInput = {
  text?: string
  fileBase64?: string
  fileName?: string
}

function emptyField<T>(): MissionFieldProposal<T> {
  return { value: null, confidence: 0, sourceExcerpt: '' }
}

function unavailableResult(): MissionExtraction {
  return {
    status: 'unavailable',
    costUsd: null,
    fields: {
      accountName: emptyField(),
      roleTitle: emptyField(),
      startedOn: emptyField(),
      endsOn: emptyField(),
      dailyRate: emptyField(),
      days: emptyField(),
      supervisedForfait: emptyField(),
    },
  }
}

type MissionExtractEnvelope = { success: boolean; data: MissionExtraction }

@Injectable()
export class MissionExtractionService {
  private readonly logger = new Logger(MissionExtractionService.name)
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
      defaultTimeoutMs: 20_000,
      defaultMaxAttempts: 1,
    })
  }

  /**
   * Propose compte, rôle, dates, TJM et jours depuis un document — jamais une
   * écriture. Une panne de transport rend `unavailable`, JAMAIS une
   * exception : cette route sert un dialogue de saisie, et une lecture
   * automatique manquée ne doit jamais empêcher de continuer à la main.
   */
  async extract(input: MissionExtractionInput): Promise<MissionExtraction> {
    try {
      const envelope = await this.http.request<MissionExtractEnvelope>({
        urlInfo: { template: '/missions/extract' },
        body: {
          text: input.text ?? null,
          file_base64: input.fileBase64 ?? null,
          file_name: input.fileName ?? null,
        },
      })
      return envelope.data
    } catch (error) {
      this.logger.warn(`Extraction de mission indisponible : ${(error as Error).message}`)
      return unavailableResult()
    }
  }
}

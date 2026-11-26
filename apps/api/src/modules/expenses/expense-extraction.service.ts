import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpClient } from '@bellum/http'
import type { StorageUploadInput } from '@bellum/contracts'

/**
 * LA LECTURE AUTOMATIQUE D'UN JUSTIFICATIF — le client vers le service IA (#1827.2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE À CÔTÉ DE `modules/ia/ia.client.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * `IaClient` est LE point d'entrée central vers le service IA pour tout le
 * reste de l'API. Ce lot est volontairement scopé à `modules/expenses/**` :
 * un client dédié, minuscule, construit avec le MÊME `HttpClient` réutilisable
 * (`@bellum/http`) et le même en-tête `x-internal-secret`, évite de toucher un
 * fichier partagé par une dizaine de domaines pour une seule route.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE PANNE DE TRANSPORT N'EST PAS UN STATUT MÉTIER
 * ─────────────────────────────────────────────────────────────────────────────
 * Le service IA rend toujours l'un de ses CINQ statuts nommés (`ok`,
 * `not_configured`, `unreadable`, `not_a_receipt`, `too_large`) — jamais une
 * exception pour un motif métier. Ici, une exception ne peut venir que du
 * TRANSPORT (réseau, timeout, 5xx) : elle est traduite en un SIXIÈME statut,
 * `unavailable`, propre à cette couche. Le confondre avec `not_configured`
 * transformerait une panne passagère en un renoncement permanent affiché à
 * l'écran — exactement la distinction que CLAUDE.md nomme « un écran qui lit
 * ce qui MANQUE sans lire l'INTERRUPTEUR annonce une panne au repos », à
 * l'envers : ici c'est une VRAIE panne qui ne doit pas se lire comme un
 * réglage.
 *
 * Aucune retentative côté client (`defaultMaxAttempts: 1`) : un appel qui a
 * RÉUSSI côté IA (le modèle a répondu, le coût est déjà engagé) mais dont la
 * réponse se perd en route ne doit pas déclencher un second appel payant pour
 * une simple proposition — l'utilisateur peut toujours retenter lui-même en
 * rouvrant la ligne.
 */
type ExpenseReceiptExtractionStatus =
  | 'ok'
  | 'not_configured'
  | 'unreadable'
  | 'not_a_receipt'
  | 'too_large'
  | 'unavailable'

type ExpenseFieldProposal<T> = {
  value: T | null
  confidence: number
  sourceExcerpt: string
  /** #2433.4 — rectangle normalisé (0..1) où le champ a été lu sur une IMAGE ; absent/`null` sinon. */
  sourceRegion?: { x: number; y: number; w: number; h: number } | null
}

export type ExpenseReceiptExtraction = {
  status: ExpenseReceiptExtractionStatus
  ocrUsed: boolean
  /** `null` = aucun appel de modèle n'a eu lieu, ou son tarif est inconnu — jamais un coût à zéro. */
  costUsd: number | null
  fields: {
    amountCents: ExpenseFieldProposal<number>
    spentOn: ExpenseFieldProposal<string>
    category: ExpenseFieldProposal<string>
    vatRateBps: ExpenseFieldProposal<number>
  }
}

function emptyField<T>(): ExpenseFieldProposal<T> {
  return { value: null, confidence: 0, sourceExcerpt: '' }
}

function unavailableResult(): ExpenseReceiptExtraction {
  return {
    status: 'unavailable',
    ocrUsed: false,
    costUsd: null,
    fields: {
      amountCents: emptyField(),
      spentOn: emptyField(),
      category: emptyField(),
      vatRateBps: emptyField(),
    },
  }
}

type ExpenseExtractEnvelope = { success: boolean; data: ExpenseReceiptExtraction }

@Injectable()
export class ExpenseExtractionService {
  private readonly logger = new Logger(ExpenseExtractionService.name)
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
   * Propose montant, date, catégorie, TVA depuis un justificatif — jamais une
   * écriture. Une panne de transport rend `unavailable`, JAMAIS une exception :
   * cette route sert un écran de saisie, et une lecture automatique manquée ne
   * doit jamais empêcher de continuer à la main.
   */
  async extract(input: StorageUploadInput): Promise<ExpenseReceiptExtraction> {
    try {
      const envelope = await this.http.request<ExpenseExtractEnvelope>({
        urlInfo: { template: '/expenses/extract' },
        body: { file_b64: input.fileB64, filename: input.fileName || null },
      })
      return envelope.data
    } catch (error) {
      this.logger.warn(`Lecture automatique de justificatif indisponible : ${(error as Error).message}`)
      return unavailableResult()
    }
  }
}

import { Injectable } from '@nestjs/common'
import {
  buildChatbotFunnel,
  buildChatbotQuality,
  readChatbotExperiment,
  type ChatbotExperimentReading,
  type ChatbotFunnelReading,
  type ChatbotQualityReading,
} from '@bellum/contracts'
import { PlausibleChatbotClient } from './plausible-chatbot.client'
import {
  buildChatbotStages,
  readMedianScore,
  type ChatbotStageReading,
  type MedianScore,
} from './chatbot-funnel-stages'

/**
 * Le tableau de bord du chantier n°1 (§11 du rapport « Laura, chatbot
 * commercial du site », 17/08/2026) — « c'est le plus utile des cinq : sans
 * lui, les quatre autres se pilotent à l'aveugle ».
 *
 * Ce service ne fait AUCUN calcul de mesure lui-même : `buildChatbotFunnel`,
 * `buildChatbotQuality` et `readChatbotExperiment` (`@bellum/contracts`)
 * portent déjà toute la doctrine (« non mesuré n'est jamais 0 », le seuil de
 * lecture nommé, aucune probabilité affichée). Ce fichier ne fait que les
 * NOURRIR avec ce que Plausible a répondu.
 */
export type ChatbotFunnelOverview = {
  generatedAt: string
  /** `false` = `PLAUSIBLE_API_KEY` ou `PLAUSIBLE_SITE_ID` absente. Le tableau de
   *  bord distingue ce cas (« la mesure n'est pas branchée ») de « la source a
   *  répondu et personne n'a rien déclenché ». */
  configured: boolean
  period: string
  /**
   * Le tunnel de #1659 : Visiteurs → Widget ouvert → Conversation →
   * Qualification atteinte → RDV pris, avec le taux de passage et le seuil
   * d'agrégation minimale appliqué. C'est celui que l'écran dessine.
   */
  stages: ChatbotStageReading[]
  /** La médiane du score, ou la raison NOMMÉE de son absence (#1659). */
  medianScore: MedianScore
  funnel: ChatbotFunnelReading[]
  quality: ChatbotQualityReading
  experiments: ChatbotExperimentReading[]
}

@Injectable()
export class ChatbotFunnelService {
  constructor(private readonly plausible: PlausibleChatbotClient) {}

  async overview(period = '30d'): Promise<ChatbotFunnelOverview> {
    const [measurement, siteVisitors, firstMessage, openTiming] = await Promise.all([
      this.plausible.eventMeasurement(period),
      this.plausible.siteVisitors(period),
      this.plausible.experimentInput('first_message', period),
      this.plausible.experimentInput('open_timing', period),
    ])

    // Le tunnel historique de `@bellum/contracts` ne lit que les occurrences —
    // sa forme d'entrée n'a jamais porté les visiteurs uniques. On lui rend
    // exactement ce qu'il attend plutôt que d'élargir un contrat partagé pour
    // un besoin qui est celui d'UN écran.
    const legacyInput = { counts: measurement.events, sourceAvailable: measurement.sourceAvailable }

    return {
      generatedAt: new Date().toISOString(),
      configured: this.plausible.isEnabled(),
      period,
      stages: buildChatbotStages({
        sourceAvailable: measurement.sourceAvailable,
        siteVisitors,
        events: measurement.events,
        visitors: measurement.visitors,
      }),
      // `null` et non une distribution vide : personne n'émet le score, donc on
      // n'a AUCUNE distribution — ce qui n'est pas « une distribution sans
      // personne dedans ». La différence est exactement celle que
      // `readMedianScore` traduit en `not_instrumented` plutôt qu'en
      // `below_threshold`.
      medianScore: readMedianScore(null),
      funnel: buildChatbotFunnel(legacyInput),
      quality: buildChatbotQuality(legacyInput),
      experiments: [
        readChatbotExperiment('first_message', firstMessage),
        readChatbotExperiment('open_timing', openTiming),
      ],
    }
  }
}

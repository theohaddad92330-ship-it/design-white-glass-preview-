import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { ChatDeepenJobsService } from './chat-deepen-jobs.service'

/** 15 minutes sans nouvelle coupure signalée : le fil est considéré sans suite. */
export const STALE_AFTER_MS = 15 * 60 * 1000
export const REAP_INTERVAL_MS = 5 * 60 * 1000

/**
 * #3236.2 (b, tranche) — le balayage qui ferme ce que personne n'a repris.
 *
 * Un `chat_deepen_job` resté `queued`/`running` sans mise à jour depuis
 * {@link STALE_AFTER_MS} bascule `unknown` — JAMAIS `failed` : un timeout
 * n'est pas un échec (doctrine CLAUDE.md), seulement l'arrêt de la reprise.
 * C'est le worker BullMQ/planifié que l'épopée #3236 nomme pour ce point ;
 * la fermeture GA-76 (SANS verrou, transition gardée par le `WHERE`) est
 * documentée sur {@link ChatDeepenJobsService.markStaleBefore}.
 *
 * Même patron qu'`OutboxDrainer`/`StuckAnalysisReaper` : un `@Interval` avec
 * garde de ré-entrance, et une méthode publique pour les tests.
 *
 * **SANS VERROU :** la transition est gardée par la clause `WHERE` de
 * `ChatDeepenJobsService.markStaleBefore` (`status IN ('queued','running')`),
 * pas par Redis — deux répliques qui balaient au même instant ne font chacune
 * avancer que les lignes que l'autre n'a pas déjà basculées `unknown`, et
 * aucune ne l'écrit deux fois. Un verrou singleton ne protégerait rien de
 * plus qu'une UPDATE idempotente ne protège déjà. Held by GA-76.
 */
@Injectable()
export class ChatDeepenJobsReaper {
  private readonly logger = new Logger(ChatDeepenJobsReaper.name)
  private inFlight = false

  constructor(private readonly jobs: ChatDeepenJobsService) {}

  @Interval(REAP_INTERVAL_MS)
  async tick(): Promise<void> {
    if (this.inFlight) return
    this.inFlight = true
    try {
      await this.sweep()
    } finally {
      this.inFlight = false
    }
  }

  async sweep(): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_AFTER_MS)
    const count = await this.jobs.markStaleBefore(cutoff)
    if (count > 0) {
      this.logger.log(`Approfondissements sans suite basculés unknown : ${count}`)
    }
    return count
  }
}

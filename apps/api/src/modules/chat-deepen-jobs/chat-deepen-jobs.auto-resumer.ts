import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import type { ChatDeepenJobEntity } from '../../database/entities/chat-deepen-job.entity'
import { ChatDeepenJobsService } from './chat-deepen-jobs.service'

/** La dernière coupure doit dater d'au moins ce délai : le tour interrompu est réglé, rien ne le double. */
export const RESUME_SETTLE_MS = 30 * 1000
export const RESUME_INTERVAL_MS = 60 * 1000
/** Le plafond de reprises automatiques d'UNE étude — au-delà, l'arrêt est nommé (`max_resumes`). */
export const MAX_AUTO_RESUMES = 3
/** Au plus ce nombre d'études par passage : une salve ne vide pas le budget d'un coup. */
const MAX_PER_SWEEP = 5

export const DEEPEN_RESUME_PORT = Symbol('DEEPEN_RESUME_PORT')

/**
 * #3236 (lot W2) — ce que la reprise automatique demande à la couche chat. Le port garde ce module
 * AUTONOME (règle 7) : il ne connaît ni le contrôleur de chat ni le service de crédits.
 */
export interface DeepenResumePort {
  /** Les crédits restants de l'espace de la personne ; `null` = non mesuré (jamais lu comme 0 ni comme illimité). */
  creditsRemaining(userId: string): Promise<number | null>
  /** Joue UN tour de reprise de la conversation, comme si la personne avait écrit « continue ». */
  resume(job: ChatDeepenJobEntity): Promise<void>
}

/**
 * #3236 (lot W2, décision Louis 11/10) — quand le budget d'une étude « Approfondi » est épuisé, le job
 * REPREND AUTOMATIQUEMENT en fond, sans « continue », jusqu'au plafond de crédits de l'espace — jamais
 * au-delà, et l'arrêt est NOMMÉ (`stopped_reason`) : `credit_ceiling`, `max_resumes` ou `resume_failed`.
 * Cela contredit la recommandation « seulement sur geste explicite » du lot J06 : la décision écrite gagne.
 *
 * **SANS VERROU :** la réclamation est gardée par la clause `WHERE` de `ChatDeepenJobsService.claimForAutoResume`
 * (`status = 'queued'`), pas par Redis — deux répliques qui balaient au même instant réclament la même ligne,
 * une seule voit `affected: 1` et reprend, l'autre passe à la suivante. Un verrou singleton ne protégerait rien
 * de plus qu'une UPDATE gardée ne protège déjà. Held by GA-76.
 *
 * Un solde NON MESURÉ ne reprend pas (on n'ouvre pas le robinet sans mesure) et ne ferme pas non plus la
 * ligne : le passage suivant relit. Sans port, rien ne part (no-op strict). Même patron que le ramasseur
 * voisin : un `@Interval` avec garde de ré-entrance et une méthode publique pour les tests.
 */
@Injectable()
export class ChatDeepenJobsAutoResumer {
  private readonly logger = new Logger(ChatDeepenJobsAutoResumer.name)
  private inFlight = false

  constructor(
    private readonly jobs: ChatDeepenJobsService,
    @Optional() @Inject(DEEPEN_RESUME_PORT) private readonly port?: DeepenResumePort,
  ) {}

  @Interval(RESUME_INTERVAL_MS)
  async tick(): Promise<void> {
    if (this.inFlight) return
    this.inFlight = true
    try {
      await this.sweep()
    } catch (error) {
      this.logger.warn(`Reprise automatique en échec : ${(error as Error).message}`)
    } finally {
      this.inFlight = false
    }
  }

  async sweep(): Promise<number> {
    const port = this.port
    if (!port) return 0
    let resumed = 0
    for (let handled = 0; handled < MAX_PER_SWEEP; handled += 1) {
      const job = await this.jobs.findQueuedBefore(new Date(Date.now() - RESUME_SETTLE_MS))
      if (!job) break
      if (job.auto_resumes >= MAX_AUTO_RESUMES) {
        await this.jobs.stop(job.id, 'max_resumes')
        continue
      }
      const remaining = await port.creditsRemaining(job.user_id).catch(() => null)
      if (remaining === null) break
      if (remaining <= 0) {
        await this.jobs.stop(job.id, 'credit_ceiling')
        continue
      }
      if (!(await this.jobs.claimForAutoResume(job.id))) continue
      try {
        await port.resume(job)
        resumed += 1
      } catch (error) {
        this.logger.warn(`Reprise de l'étude ${job.id} impossible : ${(error as Error).message}`)
        await this.jobs.stop(job.id, 'resume_failed')
      }
    }
    return resumed
  }
}

import { Module } from '@nestjs/common'
import { ChatDeepenJobsAutoResumer, DEEPEN_RESUME_PORT } from '../chat-deepen-jobs/chat-deepen-jobs.auto-resumer'
import type { DeepenResumePort } from '../chat-deepen-jobs/chat-deepen-jobs.auto-resumer'
import { ChatDeepenJobsModule } from '../chat-deepen-jobs/chat-deepen-jobs.module'
import { CreditsModule } from '../credits/credits.module'
import { CreditsService } from '../credits/credits.service'
import { DeepenResumeTurnRunner } from '../ia-proxy/chat-deepen-resume-turn'
import { IaProxyModule } from '../ia-proxy/ia-proxy.module'

/**
 * #3236 (lot W2, décision Louis 11/10) — le raccord de la reprise automatique d'une étude Approfondie :
 * le balayeur (`ChatDeepenJobsAutoResumer`, module autonome des jobs) + les deux choses qu'il demande —
 * le solde de crédits de l'espace (`CreditsService`) et un tour de chat (`DeepenResumeTurnRunner`).
 * Module AUTONOME (règle 7) : le retirer rend la reprise absente (l'étude reste `queued`, la bannière
 * la propose comme avant), sans toucher au chemin partagé du chat.
 */
@Module({
  imports: [ChatDeepenJobsModule, CreditsModule, IaProxyModule],
  providers: [
    {
      provide: DEEPEN_RESUME_PORT,
      inject: [CreditsService, DeepenResumeTurnRunner],
      useFactory: (credits: CreditsService, turn: DeepenResumeTurnRunner): DeepenResumePort => ({
        creditsRemaining: async userId => {
          const read = await credits.getCredits(userId)
          return typeof read?.credits_remaining === 'number' ? read.credits_remaining : null
        },
        resume: job => turn.run(job),
      }),
    },
    ChatDeepenJobsAutoResumer,
  ],
})
export class ChatDeepenAutoResumeModule {}

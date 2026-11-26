import { Module } from '@nestjs/common'
import { ChatTurnRegistry } from './chat-turn-registry'

/**
 * #4967 (lot L6) — le registre des tours de Laura en cours, PARTAGÉ : le contrôleur du chat y inscrit
 * ses tours, la route « Arrêter » et la lecture de l'avancement (#4611) y lisent. Un seul exemplaire
 * par processus (module importé, jamais re-déclaré ailleurs).
 */
@Module({
  providers: [{ provide: ChatTurnRegistry, useFactory: () => new ChatTurnRegistry() }],
  exports: [ChatTurnRegistry],
})
export class ChatTurnsModule {}

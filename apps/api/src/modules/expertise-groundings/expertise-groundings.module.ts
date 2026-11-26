import { Module } from '@nestjs/common'
import { EsnProfileReaderModule } from '../esn-profile/esn-profile-reader.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ExpertiseGroundingController } from './expertise-grounding.controller'
import { ExpertiseGroundingService } from './expertise-grounding.service'

/**
 * Épopée #2880 (lot V33) — module autonome (règle #7) : le retirer supprime
 * le croisement expertise ↔ fondement et son audit à 3 états, rien d'autre ;
 * les réponses plates de l'onboarding restent lues par leurs consommateurs.
 */
@Module({
  imports: [WorkspaceModule, EsnProfileReaderModule],
  controllers: [ExpertiseGroundingController],
  providers: [ExpertiseGroundingService],
})
export class ExpertiseGroundingsModule {}

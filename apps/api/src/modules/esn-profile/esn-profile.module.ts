import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EsnProfileCorrectionRequestEntity } from '../../database/entities/esn-profile-correction-request.entity'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { EsnTargetPersonaEntity } from '../../database/entities/esn-target-persona.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { AuthModule } from '../auth/auth.module'
import { NotificationsCoreModule } from '../notifications/notifications-core.module'
import { ProfileContextModule } from '../profile-context/profile-context.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { MarketMemoryModule } from '../market-memory/market-memory.module'
import { EsnProfileController } from './esn-profile.controller'
import { EsnProfileCorrectionRequestService } from './esn-profile-correction-request.service'
import { EsnProfileReaderModule } from './esn-profile-reader.module'
import { EsnProfileService } from './esn-profile.service'
import { EsnTargetPersonasController } from './esn-target-personas.controller'
import { EsnTargetPersonasService } from './esn-target-personas.service'
import { OfferPortfolioService } from './offer-portfolio.service'
import { PlacedRolesInferenceController } from './placed-roles-inference.controller'
import { PlacedRolesInferenceScheduler } from './placed-roles-inference.scheduler'
import { PlacedRolesInferenceService } from './placed-roles-inference.service'

@Module({
  imports: [
    AuthModule,
    ProfileContextModule,
    // Provides EsnProfileWorkspaceResolver (workspace-canonical resolution).
    EsnProfileReaderModule,
    // `UserActionEntity` : §8 « Historique » — trace `profile_updated`.
    // `EsnProfileCorrectionRequestEntity` : #2018.7 — la demande de signalement.
    TypeOrmModule.forFeature([
      EsnProfileEntity,
      UserActionEntity,
      EsnProfileCorrectionRequestEntity,
      // #3754 — les postes cibles de l'ESN et leur niveau décideur.
      EsnTargetPersonaEntity,
    ]),
    // Ajouté le 29/08/2026 AVEC le montage de `WorkspacePermissionGuard` sur le
    // contrôleur, et pas séparément : le guard injecte `WorkspaceContextService`,
    // que seul `WorkspaceModule` exporte. Monter le guard sans cet import fait
    // planter le service AU BOOT et nulle part avant — le graphe de modules ne
    // se vérifie qu'à l'instanciation, c'est ce que garde GA-42.
    WorkspaceModule,
    // #1636 — `GET /esn-profile/market-memory`. Le graphe de modules ne se
    // vérifie qu'à l'instanciation (GA-42) : monter l'injection sans cet import
    // ferait planter le service AU BOOT et nulle part avant.
    MarketMemoryModule,
    // #2018.8 — le canal de notification existe déjà : `NotificationsCoreModule`
    // exporte `NotificationsService` SANS le mailer/scheduler (GA-26, un
    // réglage vit à un seul endroit — jamais un second système de notif).
    NotificationsCoreModule,
  ],
  // Métiers placés DÉDUITS (11/10/2026) — contrôleur, service et rattrapage horaire.
  controllers: [EsnProfileController, EsnTargetPersonasController, PlacedRolesInferenceController],
  providers: [
    EsnProfileService,
    OfferPortfolioService,
    EsnProfileCorrectionRequestService,
    EsnTargetPersonasService,
    PlacedRolesInferenceService,
    PlacedRolesInferenceScheduler,
  ],
  exports: [EsnProfileService, OfferPortfolioService],
})
export class EsnProfileModule {}

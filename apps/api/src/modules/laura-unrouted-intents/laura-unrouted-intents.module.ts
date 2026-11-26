import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { LauraUnroutedIntentEntity } from '../../database/entities/laura-unrouted-intent.entity'
import { InternalLauraUnroutedIntentsController } from './internal-laura-unrouted-intents.controller'
import { LauraUnroutedIntentsService } from './laura-unrouted-intents.service'

/**
 * #1949.23 — décision Louis 13/09 batch 12 : la trace anonyme des demandes que
 * Laura n'a pas su router.
 *
 * Autonome (règle #7) : l'écriture est appelée par `IaProxyController` en
 * `@Optional()` — retirer ce module laisse le chat répondre exactement comme
 * avant, sans trace. La lecture agrégée du back-office vit ici, derrière
 * `InternalSecretGuard`. La purge à 90 jours vit dans le balayage RGPD
 * (`PrivacyRetentionService`), là où vivent toutes les rétentions.
 */
@Module({
  imports: [TypeOrmModule.forFeature([LauraUnroutedIntentEntity])],
  controllers: [InternalLauraUnroutedIntentsController],
  providers: [LauraUnroutedIntentsService, InternalSecretGuard],
  exports: [LauraUnroutedIntentsService],
})
export class LauraUnroutedIntentsModule {}

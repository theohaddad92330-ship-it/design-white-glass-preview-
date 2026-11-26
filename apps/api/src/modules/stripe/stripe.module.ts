import { Global, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { StripeService } from './stripe.service'

/**
 * Module global — `StripeService` est consommé par les domaines billing
 * (`CreditsService` aujourd'hui, potentiellement d'autres ensuite). On
 * l'expose une seule fois pour éviter de threader son import dans
 * chaque feature module. Même pattern que `SupabaseModule`.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}

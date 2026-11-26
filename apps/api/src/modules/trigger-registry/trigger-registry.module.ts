import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CanonicalTriggerEventEntity } from '../../database/entities/canonical-trigger-event.entity'
import { TriggerRegistryService } from './trigger-registry.service'

/**
 * #2875 (#2402.1, #2402.9) — LE REGISTRE UNIQUE des déclencheurs commerciaux.
 *
 * Module autonome (règle #7) : le retirer éteint le registre, jamais les
 * émetteurs qu'il observe — chacun continue d'écrire dans SA propre table
 * exactement comme avant `TriggerRegistryService`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CanonicalTriggerEventEntity])],
  providers: [TriggerRegistryService],
  exports: [TriggerRegistryService],
})
export class TriggerRegistryModule {}

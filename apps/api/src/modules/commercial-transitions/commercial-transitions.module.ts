import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CommercialTransitionEntity } from '../../database/entities/commercial-transition.entity'
import { CommercialTransitionsService } from './commercial-transitions.service'

/**
 * #2320.23 (épopée #2967) — le journal de transition de la chaîne
 * commerciale. Module autonome (règle #7) : le retirer efface la capacité
 * d'enregistrer/lire l'historique, sans toucher aux portes qui décident déjà
 * des transitions (`changeNeedStatus`, `ShortlistService.create`…) — elles
 * continuent d'écrire leur état sans lui, comme avant ce lot.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CommercialTransitionEntity])],
  providers: [CommercialTransitionsService],
  exports: [CommercialTransitionsService],
})
export class CommercialTransitionsModule {}

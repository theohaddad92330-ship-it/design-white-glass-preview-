import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountEntityRow } from '../../database/entities/account-entity.entity'
import { AdvRecordEntity } from '../../database/entities/adv-record.entity'
import { InvoiceReadinessEntity } from '../../database/entities/invoice-readiness.entity'
import { MissionCommercialTermsEntity } from '../../database/entities/mission-commercial-terms.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { DeliveryModule } from '../delivery/delivery.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { AdvController } from './adv.controller'
import { AdvService } from './adv.service'

/**
 * Administration des ventes — module autonome (règle CLAUDE n°7) : le retirer
 * supprime l'écran ADV et rien d'autre.
 *
 * ⚠️ Il IMPORTE `DeliveryModule` pour lire `DeliveryService.renewalsToAct` — le
 * calcul des fenêtres de renouvellement existait, complet et testé, et n'avait
 * aucun appelant côté produit. Le brancher plutôt que le recopier est la seule
 * façon d'éviter la « seconde vérité » que ce dépôt a déjà payée plusieurs fois :
 * deux écrans, deux réponses pour la même mission.
 *
 * Les entités de `forEature` sont toutes RÉELLEMENT injectées dans
 * `AdvService` — GA-20 : un dépôt injecté sans être déclaré ne se voit qu'au
 * démarrage, et le démarrage réussit en développement.
 */
@Module({
  imports: [
    WorkspaceModule,
    DeliveryModule,
    TypeOrmModule.forFeature([
      MissionEntity,
      AdvRecordEntity,
      AccountEntity,
      // Lecture SEULE des entités clientes : c'est leur SIREN qui décide entre
      // « entité vérifiée » et « entité à vérifier ». Le module `account-entities`
      // n'est pas importé — la frontière tient, et l'entité suffit.
      AccountEntityRow,
      MissionCommercialTermsEntity,
      // « Prêt à facturer » est LU ici, jamais recalculé.
      InvoiceReadinessEntity,
    ]),
  ],
  controllers: [AdvController],
  providers: [AdvService],
  exports: [AdvService],
})
export class AdvModule {}

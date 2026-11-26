import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountParkReasonEntity } from '../../database/entities/account-park-reason.entity'
import { LossReasonEntity } from '../../database/entities/loss-reason.entity'
import { NeedUnstaffableReasonEntity } from '../../database/entities/need-unstaffable-reason.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { CataloguesController } from './catalogues.controller'
import { CataloguesService } from './catalogues.service'

/**
 * Les huit catalogues d'un espace (BEL-CRM-105). Module autonome (règle #7) :
 * le retirer fait disparaître l'écran d'administration, pas les valeurs — elles
 * vivent dans les tables de leurs domaines.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([LossReasonEntity, AccountParkReasonEntity, NeedUnstaffableReasonEntity]),
    WorkspaceModule,
  ],
  controllers: [CataloguesController],
  providers: [CataloguesService],
  // #1822 — exporté pour le pont du copilote, qui LIT les listes métier pour
  // répondre à « quels motifs de perte on a ? ». La lecture seule :
  // `CataloguesService` porte aussi `add`/`remove`, et le pont ne les appelle
  // nulle part — un motif se saisit en texte libre, donc Laura RENVOIE vers
  // l'écran plutôt que d'inventer un mot à la place de l'ESN.
  exports: [CataloguesService],
})
export class CataloguesModule {}

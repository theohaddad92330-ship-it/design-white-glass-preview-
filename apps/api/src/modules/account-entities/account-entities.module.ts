import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntityRow } from '../../database/entities/account-entity.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { SiteEntity } from '../../database/entities/site.entity'
import { EsnProfileModule } from '../esn-profile/esn-profile.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { AccountEntitiesController } from './account-entities.controller'
import { AccountEntitiesService } from './account-entities.service'

/**
 * Les entités et les sites d'un compte (PDF 2 §2). Module autonome (règle #7) :
 * le retirer fait disparaître les divisions et les sites, sans toucher aux
 * comptes ni aux contacts — leurs colonnes redeviennent simplement inutilisées.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AccountEntityRow, SiteEntity, ContactEntity]),
    WorkspaceModule,
    // Le portefeuille d'offre : c'est lui qui porte la politique de site du
    // vendeur (types recherchés, effectif minimum). Sans elle, la liste des
    // sites ne peut rien dire de ce qui intéresse CE vendeur.
    EsnProfileModule,
  ],
  controllers: [AccountEntitiesController],
  providers: [AccountEntitiesService],
  exports: [AccountEntitiesService],
})
export class AccountEntitiesModule {}

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ApprovedMessageTemplateEntity } from '../../database/entities/approved-message-template.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ApprovedMessageTemplateController } from './approved-message-template.controller'
import { ApprovedMessageTemplateService } from './approved-message-template.service'

/**
 * #3417 (retour bêta 30/09, fiche contact) — module autonome (Craft rule #7) :
 * la bibliothèque versionnée des scripts et messages approuvés. La retirer
 * coupe le picker « Modèle approuvé » du composer ; elle ne casse rien
 * d'autre (aucun autre module n'en dépend dans cette tranche).
 */
@Module({
  imports: [WorkspaceModule, TypeOrmModule.forFeature([ApprovedMessageTemplateEntity, ContactEntity, AccountEntity])],
  controllers: [ApprovedMessageTemplateController],
  providers: [ApprovedMessageTemplateService],
  exports: [ApprovedMessageTemplateService],
})
export class OutreachTemplatesModule {}

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MessageStyleTemplateEntity } from '../../database/entities/message-style-template.entity'
import { MessageStyleRuleProposalEntity } from '../../database/entities/message-style-rule-proposal.entity'
import { MessageStyleImportEntity } from '../../database/entities/message-style-import.entity'
import { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import { EsnProfileReaderModule } from '../esn-profile/esn-profile-reader.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { MessageStyleController } from './message-style.controller'
import { MessageStyleService } from './message-style.service'

/**
 * #2369.9/.10/.13/.7/.8/.2/.3/.4/.5/.11/.12 (épopée #2768) — module autonome
 * (Craft rule #7) : le socle de la mémoire de style, l'import pour
 * apprentissage, le comparatif de couches (#2369.11, lit `outreach_messages`
 * en LECTURE seule pour l'exemple généré) et les métriques d'usage par style
 * (#2369.12, même lecture, pour l'agrégat). `IaClient` est `@Global()`
 * (`ia.module.ts`) — inutile de l'importer ici. Le retirer coupe la mémoire
 * de style ET son comparatif ; il ne casse rien d'autre.
 */
@Module({
  imports: [
    WorkspaceModule,
    EsnProfileReaderModule,
    TypeOrmModule.forFeature([
      MessageStyleTemplateEntity,
      MessageStyleRuleProposalEntity,
      MessageStyleImportEntity,
      OutreachMessageEntity,
    ]),
  ],
  controllers: [MessageStyleController],
  providers: [MessageStyleService],
  exports: [MessageStyleService],
})
export class MessageStyleModule {}

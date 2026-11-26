import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SequenceTemplateEntity, SequenceTemplateStepEntity } from '../../database/entities/sequence-template.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { SequenceTemplatesController } from './sequence-templates.controller'
import { SequenceTemplatesService } from './sequence-templates.service'

/**
 * #3756 — bibliothèque de modèles de séquence (import xlsx/csv, préparation
 * des étapes). Module autonome : il ne crée aucune séquence — l'application
 * d'un modèle est orchestrée par `OutreachController`, qui l'importe.
 */
@Module({
  imports: [
    WorkspaceModule,
    TypeOrmModule.forFeature([
      SequenceTemplateEntity,
      SequenceTemplateStepEntity,
      ContactEntity,
      AccountEntity,
      ProfileEntity,
    ]),
  ],
  controllers: [SequenceTemplatesController],
  providers: [SequenceTemplatesService],
  exports: [SequenceTemplatesService],
})
export class SequenceTemplatesModule {}

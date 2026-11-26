import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ConsultantSkillEntity } from '../../database/entities/consultant-skill.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { CvVersionEntity } from '../../database/entities/cv-version.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { ProofEntity } from '../../database/entities/proof.entity'
import { RfpEntity } from '../../database/entities/rfp.entity'
import { SubmissionEntity } from '../../database/entities/submission.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ProposalsController } from './proposals.controller'
import { ProposalsService } from './proposals.service'

/**
 * Le studio de proposition — module autonome (craft rule 7).
 *
 * Il ne dépend d'aucun service métier : il lit ses huit tables en direct
 * (`cv_versions` depuis BEL-SC-239 — le statut et le diff du dossier adapté,
 * jamais recalculés une seconde fois) et n'emprunte que `WorkspaceModule`, pour
 * résoudre l'espace de l'appelant. Le retirer de `AppModule` retire deux routes
 * de lecture et RIEN d'autre.
 *
 * ⚠️ BEL-SC-239 — `ProposalsService` est désormais EXPORTÉ : `CopilotBridgeModule`
 * l'importe pour que Laura puisse lire le même plan que l'écran `/propositions`,
 * jamais un second calcul. Ça reste une LECTURE, la seule direction qui existe
 * ici — écrire toujours nulle part.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      AccountEntity,
      SubmissionEntity,
      ConsultantEntity,
      ConsultantSkillEntity,
      ProofEntity,
      RfpEntity,
      CvVersionEntity,
    ]),
    WorkspaceModule,
  ],
  controllers: [ProposalsController],
  providers: [ProposalsService],
  exports: [ProposalsService],
})
export class ProposalsModule {}

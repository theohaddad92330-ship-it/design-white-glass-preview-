import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { RfpEntity } from '../../database/entities/rfp.entity'
import { RfpImportSessionEntity } from '../../database/entities/rfp-import-session.entity'
import { RfpSourceDocumentEntity } from '../../database/entities/rfp-source-document.entity'
import { EsnProfileModule } from '../esn-profile/esn-profile.module'
import { IaModule } from '../ia/ia.module'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { ProjectsModule } from '../projects/projects.module'
import { StorageModule } from '../storage/storage.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { RfpController } from './rfp.controller'
import { RfpImportSessionService } from './rfp-import-session.service'
import { RfpService } from './rfp.service'

/**
 * RFP/RFQ Studio — module autonome (règle CLAUDE n°7) : le retirer supprime les
 * appels d'offres et rien d'autre. Il ne possède aucune capacité propre : il
 * compose l'extraction de documents et les deux prompts côté IA, le profil ESN
 * pour juger du fit, et le compte pour rattacher le dossier.
 */
@Module({
  imports: [
    IaModule,
    EsnProfileModule,
    PlanFeaturesModule,
    WorkspaceModule,
    // #1097 : « transformer en besoin » écrit via le service qui POSSÈDE la
    // table des besoins, avec ses invariants. Le module ne gagne pas de
    // capacité propre — il compose celle d'à côté.
    ProjectsModule,
    // #2957 (#2180.54) — le fichier SOURCE d'un dossier importé, rangé via le
    // stockage partagé (voir le docblock de `StorageModule` : aucune porte
    // propre, le consommateur injecte `StorageService` là où le droit de
    // lecture est déjà tranché — ici, `RfpService`, qui borne déjà tout par
    // `workspace_id`).
    StorageModule,
    TypeOrmModule.forFeature([RfpEntity, RfpSourceDocumentEntity, RfpImportSessionEntity, AccountEntity]),
  ],
  controllers: [RfpController],
  providers: [RfpService, RfpImportSessionService],
  exports: [RfpService],
})
export class RfpModule {}

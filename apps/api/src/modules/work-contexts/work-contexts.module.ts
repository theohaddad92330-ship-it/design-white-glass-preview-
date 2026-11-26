import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { WorkContextEntity } from '../../database/entities/work-context.entity'
import { WorkContextActivationEntity } from '../../database/entities/work-context-activation.entity'
import { BusinessUnitModule } from '../business-unit/business-unit.module'
import { EsnProfileModule } from '../esn-profile/esn-profile.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { WorkContextsController } from './work-contexts.controller'
import { WorkContextsService } from './work-contexts.service'

/**
 * #2455 — Contextes de travail enregistrés (LAU-FINAL-168). Module autonome
 * (règle #7 CLAUDE.md) : le retirer supprime `/work-contexts/*` sans rien
 * casser ailleurs — le profil principal (`profiles`/`esn_profiles`) n'a
 * aucune dépendance vers ce module.
 *
 * #2455.6 — `EsnProfileModule` importé pour la SEULE lecture du contrôleur
 * (`profileSuggestion`, `@Optional()`) : le sens de dépendance reste le même
 * (work-contexts LIT esn-profile), jamais l'inverse — `WorkContextsService`
 * lui-même n'importe toujours rien de ce module (`usageSignal` ne lit que ses
 * propres tables).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([WorkContextEntity, WorkContextActivationEntity]),
    WorkspaceModule,
    BusinessUnitModule,
    EsnProfileModule,
  ],
  controllers: [WorkContextsController],
  providers: [WorkContextsService],
  exports: [WorkContextsService],
})
export class WorkContextsModule {}

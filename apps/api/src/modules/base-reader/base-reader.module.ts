import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { BusinessUnitModule } from '../business-unit/business-unit.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { BaseReaderController } from './base-reader.controller'
import { EmployerChoiceController } from './employer-choice.controller'
import { BaseReaderService } from './base-reader.service'

/**
 * #4792 (épopée #4791) — le lecteur commun de notre base : UN service, UNE porte interne.
 *
 * Il n'ajoute AUCUNE table et AUCUNE migration : il lit celles qui existent (`accounts`,
 * `project_needs`, `signal_history`, `consultants`, `consultant_experiences`). Le retirer ne casse
 * rien d'autre que ses deux appelants — c'est la règle d'indépendance des modules (§3.2).
 */
@Module({
  imports: [TypeOrmModule.forFeature([AccountEntity]), WorkspaceModule, BusinessUnitModule],
  controllers: [BaseReaderController, EmployerChoiceController],
  providers: [BaseReaderService],
  exports: [BaseReaderService],
})
export class BaseReaderModule {}

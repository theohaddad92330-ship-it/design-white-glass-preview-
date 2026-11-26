import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { WeakestLinkDiagnosisEntity } from '../../database/entities/weakest-link-diagnosis.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { LocksModule } from '../locks/locks.module'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { WeakestLinkDiagnosisService } from './weakest-link-diagnosis.service'
import { WeakestLinkDiagnosisReevaluationSweepService } from './weakest-link-diagnosis-reevaluation-sweep.service'
import { WeakestLinkDiagnosisController } from './weakest-link-diagnosis.controller'
import { SINGLETON_LOCK, type UnderSingletonLock } from './module-tokens'

/**
 * ⚠️ Le verrou du passage hebdomadaire (#3253.c) arrive par un JETON, pas par
 * un service injecté — GA-07 est un cliquet au plafond, voir `module-tokens.ts`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountEntity,
      ContactEntity,
      ActionPlanItemEntity,
      ProjectEntity,
      ConsultantEntity,
      MissionEntity,
      WeakestLinkDiagnosisEntity,
      WorkspaceEntity,
    ]),
    WorkspaceModule,
    LocksModule,
  ],
  controllers: [WeakestLinkDiagnosisController],
  providers: [
    WeakestLinkDiagnosisService,
    WeakestLinkDiagnosisReevaluationSweepService,
    {
      provide: SINGLETON_LOCK,
      inject: [{ token: SingletonLockService, optional: true }],
      useFactory:
        (locks?: SingletonLockService): UnderSingletonLock =>
        (name, run) =>
          withSingletonLock(locks, name, run),
    },
  ],
  exports: [WeakestLinkDiagnosisService],
})
export class WeakestLinkDiagnosisModule {}

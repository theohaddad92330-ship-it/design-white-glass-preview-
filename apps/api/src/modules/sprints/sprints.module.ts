import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { SprintProgressionBus } from './sprint-progression.bus'
import { SprintProgressionListener } from './sprint-progression.listener'
import { SprintsController } from './sprints.controller'
import { SprintsService } from './sprints.service'

/**
 * Le board d'effort — module autonome (règle #7).
 *
 * `SprintProgressionBus` est exporté pour que `ContactsModule` (qui importe
 * déjà ce module) puisse ÉMETTRE « l'issue d'un contact a été enregistrée »
 * sans importer `SprintsService` (GA-07, m18) — `SprintProgressionListener`
 * s'y abonne et fait l'appel à sa place.
 *
 * ⚠️ N'IMPORTE PAS `AccountsModule` — et ne doit jamais le faire. Le porteur
 * sur la carte du board (#3257.7a) le laisserait croire nécessaire ;
 * `AccountsModule` importe déjà `ContactsModule`, qui importe déjà CE module :
 * l'ajouter fermerait un cycle. `SprintsController` pose l'étiquette via la
 * dérivation PARTAGÉE (`account-owner.util.ts`) sur son propre
 * `Repository<AccountEntity>`, déjà enregistré juste en dessous — jamais via
 * le service des comptes.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AccountEntity]), WorkspaceModule],
  controllers: [SprintsController],
  providers: [SprintsService, SprintProgressionBus, SprintProgressionListener],
  exports: [SprintsService, SprintProgressionBus],
})
export class SprintsModule {}

import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { AccountsModule } from '../accounts/accounts.module'
import { MarketMemoryModule } from '../market-memory/market-memory.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { CoverageController } from './coverage.controller'
import { CoverageService } from './coverage.service'
import { BusinessUnitModule } from '../business-unit/business-unit.module'

/**
 * Zones blanches / coverage gaps module (Drive backlog #5). Self-contained:
 * it owns the `GET /accounts/:id/coverage-gaps` route and reuses
 * {@link AccountsService} for the workspace ownership check and
 * {@link WorkspaceContextService} to resolve the caller's workspace. Removing it
 * leaves the rest of the accounts/contacts surface untouched (craft rule 7).
 *
 * `AccountsModule` en `forwardRef()` : depuis que `AnalysisModule` importe ce
 * module (planificateur d'enrichissement, mode « Rôles manquants »), le
 * chemin AccountsModule -> AnalysisModule -> CoverageModule -> AccountsModule
 * boucle sur trois modules — `AccountsModule` importe déjà `AnalysisModule`
 * en `forwardRef()` pour la même raison. Sans celui-ci ICI :
 * `ReferenceError: Cannot access 'AccountsModule' before initialization` dès
 * qu'un test charge `AccountsModule` en premier dans la chaîne.
 *
 * `MarketMemoryModule` (#1610) — la mémoire marché est un module AUTONOME
 * (voir sa doctrine) : l'importer n'ajoute aucun couplage, et un corpus
 * absent ou une lecture en panne rendent exactement l'écran d'avant ce lot.
 */
@Module({
  imports: [
    // Le cloisonnement de périmètre (BU) — le contrôleur le résout au bord.
    // Module autonome (il n'importe que WorkspaceModule) : aucun cycle.
    BusinessUnitModule,
    TypeOrmModule.forFeature([ContactEntity, AccountEntity]),
    forwardRef(() => AccountsModule),
    WorkspaceModule,
    MarketMemoryModule,
  ],
  controllers: [CoverageController],
  providers: [CoverageService],
  // Réutilisé par le planificateur d'enrichissement (« Rôles manquants ») pour
  // cibler les zones blanches SANS recalculer une seconde fois la couverture.
  exports: [CoverageService],
})
export class CoverageModule {}

import { Module } from '@nestjs/common'
import { AccountsModule } from '../accounts/accounts.module'
import { MarketMemoryModule } from '../market-memory/market-memory.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { CompaniesController } from './companies.controller'
import { CompaniesService } from './companies.service'

/**
 * `MarketMemoryModule` (#1586) — la mémoire marché est un module AUTONOME :
 * l'importer n'ajoute aucun couplage, et une lecture en panne ou un corpus
 * absent rendent `marketPaths: null` sur chaque suggestion plutôt que de
 * casser l'autocomplétion.
 */
/**
 * #2288.2 — `AccountsModule` et `WorkspaceModule` : QUELS comptes de l'appelant
 * sont les entreprises trouvées, seule façon de dater un signal PAR ENTREPRISE
 * sans rapprocher deux référentiels par leur nom. Les deux injections sont
 * `@Optional()` côté contrôleur : absentes, la recherche rend les mêmes
 * entreprises sans date.
 */
@Module({
  imports: [MarketMemoryModule, AccountsModule, WorkspaceModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  // #2293.4 — la résolution d'un nom en entité, pour la préview d'un lot d'analyses.
  exports: [CompaniesService],
})
export class CompaniesModule {}

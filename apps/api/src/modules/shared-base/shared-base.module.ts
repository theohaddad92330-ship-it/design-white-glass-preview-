import { Module } from '@nestjs/common'
import { SharedBaseAggregationService } from './shared-base-aggregation.service'
import { SharedBaseReaderService } from './shared-base-reader.service'
import { SharedCompanyFactsService } from './shared-company-facts.service'

/**
 * P05 (#3246, lot 09/10) — la base anonyme commune entre espaces
 * (`c92_base_anonyme_commune`). Autonome (règle 7) : aucune entité d'un autre
 * module, aucun service voisin — le retirer laisse Laura répondre « chez
 * nous » seulement, sans la ligne « ailleurs ».
 *
 * #3989 (Louis 11/10/2026, `c94_base_commune_capitalise_tout`) — s'y ajoute
 * le versement nocturne des faits société partagés (`SharedCompanyFactsService`).
 */
@Module({
  providers: [SharedBaseAggregationService, SharedBaseReaderService, SharedCompanyFactsService],
  exports: [SharedBaseReaderService],
})
export class SharedBaseModule {}

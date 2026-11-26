import { Injectable } from '@nestjs/common'
import { MarketMemoryService, type MarketCompanyLookup } from './market-memory.service'

type Service = MarketMemoryService

/**
 * La PORTE de lecture de la mémoire marché pour les autres modules (MCP).
 * Trois lectures, aucune écriture : un consommateur n'importe pas le service
 * entier, il dépend de ce que le module accepte de montrer (GA-07).
 */
@Injectable()
export class MarketSignalsReader {
  constructor(private readonly market: MarketMemoryService) {}

  searchByFilters(...args: Parameters<Service['searchByFilters']>): ReturnType<Service['searchByFilters']> {
    return this.market.searchByFilters(...args)
  }

  resolveDetailed(lookup: MarketCompanyLookup): ReturnType<Service['resolveDetailed']> {
    return this.market.resolveDetailed(lookup)
  }

  coverageFor(lookup: MarketCompanyLookup): ReturnType<Service['coverageFor']> {
    return this.market.coverageFor(lookup)
  }
}

export type { MarketCompanyLookup }

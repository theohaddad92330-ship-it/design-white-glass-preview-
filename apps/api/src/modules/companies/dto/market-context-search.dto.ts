import { createZodDto } from 'nestjs-zod'
import { marketContextSearchQuerySchema } from '@bellum/contracts'

/** #1626 — la requête de `GET /companies/market-context-search`. */
export class MarketContextSearchDto extends createZodDto(marketContextSearchQuerySchema) {}

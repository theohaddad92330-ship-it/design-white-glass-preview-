import { createZodDto } from 'nestjs-zod'
import { marketPathsQuerySchema } from '@bellum/contracts'

/** #1593.2 — la requête de `GET /companies/market-paths`. */
export class MarketPathsDto extends createZodDto(marketPathsQuerySchema) {}

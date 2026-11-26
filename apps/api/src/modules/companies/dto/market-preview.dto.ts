import { createZodDto } from 'nestjs-zod'
import { marketPreviewQuerySchema } from '@bellum/contracts'

/** #1589.2 — la requête de `GET /companies/market-preview`. */
export class MarketPreviewDto extends createZodDto(marketPreviewQuerySchema) {}

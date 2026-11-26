import { createZodDto } from 'nestjs-zod'
import { marketMemoryGroundTruthLookupQuerySchema } from '@bellum/contracts'

/** #1622 — la requête de `GET internal/admin/market-memory-ground-truth/lookup`
 *  (aperçu SEUL, n'écrit rien). */
export class GroundTruthLookupQueryDto extends createZodDto(marketMemoryGroundTruthLookupQuerySchema) {}

import { createZodDto } from 'nestjs-zod'
import { analysisHistoryQuerySchema } from '@bellum/contracts'

/** Query de `GET /analysis/history` (Théo B r2-mes-analyses) : `scope=space|me`, `limit`. */
export class AnalysisHistoryQueryDto extends createZodDto(analysisHistoryQuerySchema) {}

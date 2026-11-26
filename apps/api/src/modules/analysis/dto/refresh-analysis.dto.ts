import { createZodDto } from 'nestjs-zod'
import { refreshAnalysisSchema } from '@bellum/contracts'

/** Body of POST /analysis/:accountId/refresh — which dimension to refresh
 *  (signals / contacts / entities / strategy). */
export class RefreshAnalysisDto extends createZodDto(refreshAnalysisSchema) {}

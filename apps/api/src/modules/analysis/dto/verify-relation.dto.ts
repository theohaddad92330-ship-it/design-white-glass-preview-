import { createZodDto } from 'nestjs-zod'
import { verifyRelationSchema } from '@bellum/contracts'

/** Body of POST /analysis/:accountId/verify-relation — the ONE org link to prove. */
export class VerifyRelationDto extends createZodDto(verifyRelationSchema) {}

import { createZodDto } from 'nestjs-zod'
import { cvRewriteRequestSchema } from '@bellum/contracts'

/** Body de POST /consultants/:id/cv-rewrite — réécriture du CV selon la mission
 *  (annexe méthodo p22). */
export class CvRewriteDto extends createZodDto(cvRewriteRequestSchema) {}

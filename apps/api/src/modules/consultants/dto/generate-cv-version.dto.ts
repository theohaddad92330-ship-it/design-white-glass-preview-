import { createZodDto } from 'nestjs-zod'
import { generateCvVersionSchema } from '@bellum/contracts'

/** Ce qu'on demande au studio de composer (§9). */
export class GenerateCvVersionDto extends createZodDto(generateCvVersionSchema) {}

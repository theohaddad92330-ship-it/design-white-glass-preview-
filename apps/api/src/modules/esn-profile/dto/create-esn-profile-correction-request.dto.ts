import { createZodDto } from 'nestjs-zod'
import { createEsnProfileCorrectionRequestSchema } from '@bellum/contracts'

// #2018.7 — signaler une information d'entreprise fausse, sans l'écraser.
export class CreateEsnProfileCorrectionRequestDto extends createZodDto(createEsnProfileCorrectionRequestSchema) {}

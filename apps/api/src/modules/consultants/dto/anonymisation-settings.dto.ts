import { createZodDto } from 'nestjs-zod'
import { anonymisationSettingsSchema } from '@bellum/contracts'

/** La règle d'anonymisation d'un espace (§9.2). */
export class AnonymisationSettingsDto extends createZodDto(anonymisationSettingsSchema) {}

import { createZodDto } from 'nestjs-zod'
import { eraseConsultantsSchema } from '@bellum/contracts'

// #3781 — l'effacement RGPD EN LOT : `confirm: true` ou 400, avant toute lecture.
export class EraseConsultantsDto extends createZodDto(eraseConsultantsSchema) {}

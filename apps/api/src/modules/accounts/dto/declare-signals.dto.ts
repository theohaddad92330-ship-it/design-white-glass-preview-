import { createZodDto } from 'nestjs-zod'
import { declareAccountSignalsRequestSchema } from '@bellum/contracts'

/**
 * #2634.1 — corps de `POST /accounts/:id/signals/declare`. Le compte visé est
 * celui de l'URL, jamais du corps (même convention que `AbsorbAccountDto`).
 */
export class DeclareSignalsDto extends createZodDto(declareAccountSignalsRequestSchema) {}

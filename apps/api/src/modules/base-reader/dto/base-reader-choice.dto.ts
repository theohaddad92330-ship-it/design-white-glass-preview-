import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/** #4419.8 — le choix d'une entreprise pour un nom d'employeur. `.strict()` : une faute de frappe échoue. */
export class EmployerChoiceDto extends createZodDto(
  z
    .object({
      employerName: z.string().trim().min(2).max(160),
      siren: z
        .string()
        .trim()
        .regex(/^\d{9}$/),
      legalName: z.string().trim().min(1).max(200).nullable().optional(),
    })
    .strict(),
) {}

import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// #3850.1 — le geste d'opérateur de l'archivage ciblé des téléphones
// invalides. `actor` trace QUI a déclenché le lot ; `limit` borne le nombre
// de contacts archivés en un appel — jamais tout le parc.
export const adminInvalidPhoneArchiveSchema = z.object({
  actor: z.string().max(200).optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
})
export class AdminInvalidPhoneArchiveDto extends createZodDto(adminInvalidPhoneArchiveSchema) {}

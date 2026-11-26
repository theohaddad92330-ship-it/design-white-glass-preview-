import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/** #4419.7 — le nom d'un employeur, et l'appelant dont l'espace borne la lecture. `.strict()` : une faute de frappe échoue. */
export class BaseReaderIdentityDto extends createZodDto(
  z.object({ userId: z.string().guid(), name: z.string().trim().min(2).max(160) }).strict(),
) {}

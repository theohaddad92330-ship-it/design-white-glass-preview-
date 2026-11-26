import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/** Le compte que l'on GARDE (#1111). Le doublon est celui de l'URL. */
export class AbsorbAccountDto extends createZodDto(z.object({ into: z.string().guid() })) {}

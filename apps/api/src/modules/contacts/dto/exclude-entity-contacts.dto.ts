import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/** #4928.5 — l'entité ET le motif sont obligatoires : jamais « écarter tout le compte », jamais un « non » sans raison. */
export class ExcludeEntityContactsDto extends createZodDto(
  z.object({ entity: z.string().trim().min(1).max(300), reason: z.string().trim().min(1).max(500) }).strict(),
) {}

/** #4928.5 — le geste inverse nomme l'entité ; le motif d'origine est celui du serveur. */
export class RestoreEntityContactsDto extends createZodDto(
  z.object({ entity: z.string().trim().min(1).max(300) }).strict(),
) {}

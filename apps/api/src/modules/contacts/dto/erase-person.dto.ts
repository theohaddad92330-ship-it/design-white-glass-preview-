import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * #2297 — corps de `POST /contacts/:id/erasure`. L'effacement est IRRÉVERSIBLE :
 * le client doit dire `confirm: true`, ce qu'il ne fait qu'après la
 * confirmation explicite de l'écran. Toute autre forme est un 400, avant que
 * le service ne lise quoi que ce soit.
 */
export class ErasePersonDto extends createZodDto(
  z.object({ confirm: z.literal(true, { error: "Confirme l'effacement." }) }).strict(),
) {}

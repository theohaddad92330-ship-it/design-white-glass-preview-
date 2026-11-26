import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * Import d'un fichier de prospection.
 *
 * `dryRun` est le défaut à `false` mais la seule valeur que l'écran envoie en
 * premier : on montre ce qu'on a compris avant d'écrire. La borne de taille
 * (1 Mo) est là pour qu'un fichier collé par erreur soit refusé proprement
 * plutôt que de saturer une requête.
 */
export const importContactsCsvSchema = z
  .object({
    content: z.string().min(1).max(1_000_000),
    dryRun: z.boolean().default(false),
  })
  .strict()

export class ImportContactsCsvDto extends createZodDto(importContactsCsvSchema) {}

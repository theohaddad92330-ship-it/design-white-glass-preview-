import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * #3094 — « quels sont les comptes de <membre> ? ». `ownerName` est le nom
 * TAPÉ par l'utilisateur (texte libre, jamais un identifiant) : la résolution
 * vers un membre réel de l'espace se fait côté contrôleur
 * ({@link matchWorkspaceMemberByName}), pas ici — ce DTO ne borne que la
 * FORME de la requête.
 */
export class CopilotAccountsByOwnerDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      ownerName: z.string().trim().min(1).max(120),
      limit: z.number().int().min(1).max(25).optional(),
    })
    .strict(),
) {}

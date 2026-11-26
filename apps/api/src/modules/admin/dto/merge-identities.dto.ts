import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * Fusion contrôlée de deux comptes qui sont la même personne (IDENT-01).
 *
 * Les DEUX identifiants sont exigés, et dans un ordre qui a un sens : le compte
 * gardé, puis celui à absorber. Aucun défaut, aucune déduction depuis la
 * détection — un geste irréversible sur des données ne doit jamais pouvoir
 * partir d'un seul identifiant, où l'inversion des deux passerait inaperçue.
 */
export const mergeIdentitiesSchema = z
  .object({
    keep_user_id: z.string().guid(),
    absorb_user_id: z.string().guid(),
  })
  .refine(dto => dto.keep_user_id !== dto.absorb_user_id, {
    message: 'Les deux identifiants sont identiques — rien à fusionner.',
    path: ['absorb_user_id'],
  })
export class MergeIdentitiesDto extends createZodDto(mergeIdentitiesSchema) {}

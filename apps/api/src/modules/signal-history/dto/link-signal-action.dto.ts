import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * Corps `POST /signal-history/actions` — « ce signal m'a fait faire quelque
 * chose » (restitution V2 §20, l'objet `Signal` et son ACTION).
 *
 * Le signal est désigné par son identité PARTAGÉE (compte + libellé), la même
 * que la matérialisation et la lecture : l'`id` que la Veille affiche est un id
 * de projection (`<account>-signal-<index>`), pas une clé stable.
 *
 * `label` est le libellé du signal, pas celui de l'action : l'action est
 * intitulée par le serveur à partir de ce signal, pour qu'un texte libre du
 * client ne puisse pas se faire passer pour un signal détecté.
 */
export const linkSignalActionSchema = z.object({
  accountId: z.string().guid(),
  label: z.string().trim().min(1).max(500),
  /** Échéance optionnelle `YYYY-MM-DD` — reprise telle quelle par la relance. */
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
})
export class LinkSignalActionDto extends createZodDto(linkSignalActionSchema) {}

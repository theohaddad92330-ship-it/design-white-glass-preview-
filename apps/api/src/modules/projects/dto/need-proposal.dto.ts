import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * Le projet est FOURNI, jamais deviné.
 *
 * Rattacher une proposition au hasard produirait un besoin sur la mauvaise
 * affaire — et personne ne le verrait avant de l'envoyer à un client.
 */
export class AcceptNeedProposalDto extends createZodDto(z.object({ projectId: z.string().guid() }).strict()) {}

/** Le motif est obligatoire : c'est le seul apprentissage que produit un « non ». */
export class DismissNeedProposalDto extends createZodDto(
  z.object({ reason: z.string().trim().min(1).max(500) }).strict(),
) {}

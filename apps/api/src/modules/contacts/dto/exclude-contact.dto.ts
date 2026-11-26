import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * Le motif est OBLIGATOIRE, et c'est tout l'intérêt du geste.
 *
 * C'est le seul apprentissage que produit un « non » : sans lui, on relit dans
 * six mois une liste de contacts disparus sans savoir lesquels ont quitté
 * l'entreprise et lesquels ont demandé qu'on les laisse tranquilles. Un champ
 * facultatif serait vide neuf fois sur dix.
 */
export class ExcludeContactDto extends createZodDto(z.object({ reason: z.string().trim().min(1).max(500) }).strict()) {}

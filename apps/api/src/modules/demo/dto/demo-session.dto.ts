import { createZodDto } from 'nestjs-zod'
import { workspaceProfileSchema } from '@bellum/contracts'
import { z } from 'zod'

// Optionnel : le lien public (`/demo`) n'en porte pas. Il n'est requis que sur
// un environnement verrouillé par DEMO_LINK_TOKEN. Borné pour qu'une valeur
// malformée ou hostile soit rejetée par le pipe avant la comparaison.
export const demoSessionSchema = z.object({
  token: z.string().min(1).max(512).optional(),
  // #3511 — `true` = renouveler la session de la salle que CE navigateur tient
  // (cookie d'appareil), sans en louer une autre. Même route que l'entrée : le
  // gel du nombre de routes nues (GA-05) ne se relève jamais.
  renew: z.boolean().optional(),
  // #4291 J — la démo demandée : `forfait_conseil` = le second espace démo (« Lancer la démo forfait / conseil ») ;
  // absent = la démo staffing d'avant. Liste fermée des profils d'espace livrés (#4270), jamais une chaîne libre.
  profile: workspaceProfileSchema.optional(),
})
export class DemoSessionDto extends createZodDto(demoSessionSchema) {}

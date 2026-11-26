import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// #2528.3 — le signal interne (moteur IA ou API) qu'une source vient de rendre
// un 402/429 de quota. `source` est une clé d'environnement (`BRAVE_API_KEY`),
// jamais un texte libre : ce nom finit dans l'objet d'un e-mail envoyé aux
// owners, une clé d'env est le seul format que ce canal opérateur promet de
// nommer (voir CLAUDE.md, « on nomme ce que l'espace a branché… NOS
// fournisseurs ne se nomment jamais » — exception écrite pour CE canal, pas
// pour l'app). `sinceIso` vient de l'appelant : lui seul sait quand la
// dégradation a commencé dans SA fenêtre. `resolved: true` ferme le sujet —
// une source qui revient puis retombe ré-ouvre une alerte neuve.
export const providerCreditsExhaustedSchema = z.object({
  source: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'source doit être une clé d’environnement (ex. BRAVE_API_KEY)'),
  sinceIso: z.string().datetime({ offset: true }),
  degraded: z.string().min(1).max(500),
  resolved: z.boolean().optional(),
})
export class ProviderCreditsExhaustedDto extends createZodDto(providerCreditsExhaustedSchema) {}

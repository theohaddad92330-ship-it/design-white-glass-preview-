import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// SIG-C (11/10) — le signal interne (moteur IA) qu'un fournisseur est EN ERREUR
// sur N appels consécutifs. Même contrat de nommage que
// `provider-credits-exhausted.dto.ts` : `source` est une clé d'environnement
// (`THEIRSTACK_API_KEY`), le seul format que ce canal OPÉRATEUR promet de nommer.
// `lastReason` est un statut HTTP ou un type d'erreur (« HTTP 403 »,
// « ReadTimeout ») — jamais un message brut, qui peut porter une URL à clé.
export const providerSilentSchema = z.object({
  source: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'source doit être une clé d’environnement (ex. THEIRSTACK_API_KEY)'),
  sinceIso: z.string().datetime({ offset: true }),
  consecutiveErrors: z.number().int().min(1).max(1_000_000),
  lastReason: z.string().min(1).max(200),
  degraded: z.string().min(1).max(500),
  resolved: z.boolean().optional(),
})
export class ProviderSilentDto extends createZodDto(providerSilentSchema) {}

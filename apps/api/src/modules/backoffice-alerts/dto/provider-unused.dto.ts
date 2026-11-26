import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// ALERTES-402 (30/10/2026) — le signal interne (moteur IA) qu'une source CONFIGURÉE n'a plus été
// APPELÉE depuis N jours. Contrat SÉPARÉ de `provider-silent.dto.ts` exprès : « muette » compte des
// erreurs consécutives (au moins une, sinon la phrase est absurde) et ne voit RIEN d'une source que
// le cache rend inutile — TheirStack est resté à sec (402) du 28 au 30/10/2026 sans produire une
// seule erreur, pendant que Découvrir servait son cache 30 j. Même contrat de nommage : `source` est
// une clé d'environnement, `degraded` ne nomme jamais un fournisseur.
export const providerUnusedSchema = z.object({
  source: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'source doit être une clé d’environnement (ex. THEIRSTACK_API_KEY)'),
  lastCallIso: z.string().datetime({ offset: true }),
  days: z.number().int().min(1).max(3650),
  degraded: z.string().min(1).max(500),
})
export class ProviderUnusedDto extends createZodDto(providerUnusedSchema) {}

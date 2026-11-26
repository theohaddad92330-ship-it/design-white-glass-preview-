import { z } from 'zod'

/**
 * Théo D settings-outils.N1 — « Cadre d'un nouvel accès » (Réglages › Outils › Accès assistants / MCP).
 *
 * Une INTENTION de configuration, pas un accès : un membre nomme l'assistant qu'il compte brancher et dit ce qu'il doit
 * voir (ses dossiers, ou ceux qu'on partage avec lui) ; un administrateur la valide ou la refuse. Aucun jeton n'est
 * délivré ici — il ne l'est qu'à la connexion de l'assistant, par le consentement habituel. Et jamais de droit
 * d'écriture : le formulaire est en lecture seule par construction (aucun champ d'écriture n'existe, le schéma est
 * strict), les écritures sensibles restant soumises à validation.
 */
export const MCP_ACCESS_INTENT_PERIMETERS = ['mine', 'shared'] as const
export const mcpAccessIntentPerimeterSchema = z.enum(MCP_ACCESS_INTENT_PERIMETERS)

export const MCP_ACCESS_INTENT_STATUSES = ['pending', 'approved', 'declined'] as const
export const mcpAccessIntentStatusSchema = z.enum(MCP_ACCESS_INTENT_STATUSES)

export const createMcpAccessIntentSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    perimeter: mcpAccessIntentPerimeterSchema,
  })
  .strict()
export type CreateMcpAccessIntentInput = z.infer<typeof createMcpAccessIntentSchema>

export const decideMcpAccessIntentSchema = z.object({ decision: z.enum(['approved', 'declined']) }).strict()
export type DecideMcpAccessIntentInput = z.infer<typeof decideMcpAccessIntentSchema>

/** Ce que l'écran lit. `requestedByName` : le nom de la personne, en clair (équipe), jamais un identifiant seul. */
export type McpAccessIntent = {
  id: string
  name: string
  perimeter: z.infer<typeof mcpAccessIntentPerimeterSchema>
  status: z.infer<typeof mcpAccessIntentStatusSchema>
  requestedBy: string
  requestedByName: string | null
  createdAt: string
  decidedAt: string | null
}

import type { MemoryBridgeView } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * Client mince du module « mémoire collective » de l'API (`/workspaces/memory/*`).
 *
 * ⚠️ Aucun identifiant d'espace ne voyage ici, et ce n'est pas un oubli : l'API
 * le résout depuis le JWT. Une route qui accepterait qu'on lui dise quel espace
 * lire ne pourrait pas tenir le premier invariant de la spec sécurité.
 *
 * Louis 14/10/2026 : les écrans de liste et d'écriture (« j'ai contacté ce
 * collègue ») sont supprimés avec l'onglet ; les endpoints restent côté API.
 */
export const memoryBridgeApi = {
  /** Ce que l'espace sait déjà de ce compte. */
  view(accountId: string): Promise<MemoryBridgeView> {
    return apiFetch<MemoryBridgeView>({ path: `/workspaces/memory/accounts/${accountId}` })
  },
}

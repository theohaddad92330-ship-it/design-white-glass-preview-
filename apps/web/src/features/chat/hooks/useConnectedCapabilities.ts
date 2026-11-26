import { useQuery } from '@tanstack/react-query'
import {
  connectedClientTools,
  toolFamiliesOf,
  toolFamilyValues,
  unconnectedClientToolFamilies,
  type ConnectedClientTool,
  type ToolFamily,
} from '@bellum/contracts'
import { integrationCenterApi, TOOL_REGISTRY_KEY } from '@/features/integration-center/api'
import { useSession } from '@/lib/hooks/use-session'

// perf P3 — même clé que `useToolRegistry` : UN seul appel à `/tool-registry` par page.

/**
 * #1791.1 — les familles d'outils VIVANTES (au sens du registre — connectées,
 * ou connectées-mais-à-reconnecter, `tool-registry.ts` `toolStatusValues`) pour
 * le menu « désigner un connecteur » de la barre de saisie.
 *
 * Réutilise `/tool-registry`, la même lecture que l'écran Réglages ›
 * Intégrations (`integrationCenterApi.registry`, déjà appelé par
 * `useToolRegistry`) — deux chemins qui liraient le même registre
 * divergeraient. On ne réexporte pas `useToolRegistry` tel quel : cet écran
 * choisit délibérément `staleTime: 0` parce qu'on y vient VÉRIFIER qu'une
 * réparation a pris ; ici on ne fait que peupler un menu, donc un cache court
 * (comme `useTeam`, `useIntegrations`) évite une requête à chaque frappe dans
 * le composer.
 *
 * ⚠️ Rendu par FAMILLE, jamais par outil ni par éditeur (GA-44) : deux CRM
 * connectés ne doivent produire qu'une seule entrée dans le menu. L'ordre suit
 * `toolFamilyValues` (le même ordre que `CAPABILITY_LABELS` côté API,
 * `apps/api/src/modules/tool-registry/tool-capability-digest.ts`) pour que le
 * menu ne se réordonne pas d'un rendu à l'autre.
 */
export function useConnectedCapabilities(): {
  families: ToolFamily[]
  /**
   * #1912.11 — décision Louis 13/09/2026, batch 11 : les outils que l'espace a
   * BRANCHÉS, sous leur nom, pour la saisie de Laura et le brouillon « dans
   * Gmail ». Dérivés par `connectedClientTools` (`@bellum/contracts`), qui
   * écarte nos fournisseurs et tout outil non connecté — les familles ci-dessus,
   * elles, restent des CAPACITÉS.
   */
  tools: ConnectedClientTool[]
  /** #3708.2 — les familles branchables et non branchées : « non connecté », par besoin, jamais par éditeur. */
  unconnectedFamilies: ToolFamily[]
  isLoading: boolean
  /** #5042 R4 — le registre a répondu (donnée OU échec). Désactivé (session pas prête) : `isLoading=false` et `false` ici. */
  arrived: boolean
} {
  const { user } = useSession()
  const query = useQuery({
    queryKey: TOOL_REGISTRY_KEY,
    queryFn: () => integrationCenterApi.registry(),
    enabled: !!user,
    staleTime: 30_000,
  })
  /*
   * ⚠️ `Array.isArray` et pas `?? []`, et ce n'est pas de la superstition.
   *
   * Ce hook vit dans la BARRE DE SAISIE, donc dans un composant monté sur
   * presque tout le produit. Un `.filter` sur autre chose qu'un tableau ne
   * casse pas ce menu : il fait tomber l'ÉCRAN ENTIER, et des tests qui ne
   * parlent pas du sujet avec lui — mesuré le 09/09/2026, 22 tests rouges dans
   * cinq fichiers dont aucun ne mentionne les connecteurs.
   *
   * Deux façons d'obtenir autre chose qu'un tableau, et aucune n'est théorique :
   * un corps d'erreur rendu à la place de la liste, et la fenêtre de
   * déploiement où le front est neuf pendant que l'API est ancienne. Le contrat
   * dit `ConnectedTool[]` ; ce qui arrive vraiment se garde.
   */
  const tools = Array.isArray(query.data) ? query.data : []
  const live = new Set(
    tools.filter(tool => tool?.status === 'connected' || tool?.status === 'action_required').flatMap(toolFamiliesOf),
  )
  return {
    families: toolFamilyValues.filter(family => live.has(family)),
    tools: connectedClientTools(tools),
    unconnectedFamilies: unconnectedClientToolFamilies(tools),
    isLoading: query.isLoading,
    arrived: query.data !== undefined || query.isError,
  }
}

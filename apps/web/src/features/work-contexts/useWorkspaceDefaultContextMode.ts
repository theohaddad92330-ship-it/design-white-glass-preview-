import { useQuery } from '@tanstack/react-query'
import type { LauraContextMode } from '@bellum/contracts'
import { LAURA_MODE_SETTINGS_KEY, lauraModeSettingsApi } from './lib/laura-mode-settings-api'

/**
 * #2451.9 — le mode de contexte par défaut de l'espace, lu par le composeur de
 * Laura (`ContextModeSelector`). `undefined` tant que la lecture n'est pas
 * arrivée (ou a échoué) : l'appelant garde alors le repli déjà en mémoire
 * (`DEFAULT_LAURA_CONTEXT_MODE`), jamais un mode deviné.
 *
 * Un hook à part, plutôt qu'un `useQuery` posé dans `ContextModeSelector` :
 * le composeur est monté dans CHAQUE test de `Chat.*.test.tsx`, dont plusieurs
 * rendent `Chat` sans `QueryClientProvider` par choix (même raison que
 * `useDeleteRagDocument`/`useMemoryScopeOptions`, #1982/#1918.5) — un seul
 * point à mocker, pas un `useQuery` de plus dans un composant qu'ils ne
 * mesurent pas.
 */
export function useWorkspaceDefaultContextMode(): LauraContextMode | undefined {
  const query = useQuery({
    queryKey: LAURA_MODE_SETTINGS_KEY,
    queryFn: () => lauraModeSettingsApi.get(),
    staleTime: 5 * 60_000,
  })
  return query.data?.defaultContextMode
}

import { useQuery } from '@tanstack/react-query'
import {
  ESN_SUGGEST_MIN_QUERY_LENGTH,
  type EsnDirectorySuggestion,
  type EsnDirectorySuggestResponse,
} from '@bellum/contracts'
import { useDebounce } from '@/hooks/useDebounce'
import { apiFetch } from '@/lib/api'

/**
 * #1887 — CE QUE NOTRE RÉFÉRENTIEL PROPOSE PENDANT QU'ON TAPE.
 *
 * Aligné sur `useCompanySearch` (l'autocomplétion de l'écran de lancement
 * d'analyse) plutôt que réinventé : même délai de 300 ms, même `useQuery` pour
 * dédoublonner et mettre en cache, même façon de distinguer « en train de
 * chercher » de « rien trouvé ». Ce qui change est la SOURCE — notre table
 * `esn_directory`, pas le registre public — et donc l'appel.
 *
 * ⚠️ UNE DIFFÉRENCE DÉLIBÉRÉE : ce hook NE POSSÈDE PAS la frappe, il la reçoit.
 * `useCompanySearch` garde la sienne, ce qui oblige chaque appelant à la lui
 * répéter à chaque touche — un appelant qui l'oublie a un champ qui ne suggère
 * rien, et ça s'est déjà produit. Ici il n'y a qu'un état de frappe, celui du
 * champ.
 *
 * ⚠️ AUCUNE PROP FONCTION EN DÉPENDANCE D'EFFET. Le défaut mesuré dans ce dépôt
 * — un effet qui appelle une prop fonction et la met en dépendance part une
 * fois par seconde sans fin, et le seul symptôme visible est un « Recherche… »
 * qui traîne. Ici la seule dépendance est une CHAÎNE : `useDebounce` observe la
 * valeur, `useQuery` s'enclenche sur la clé. Une frappe de « capgemini » part
 * en UNE requête.
 */
const DEBOUNCE_MS = 300

type EsnDirectorySuggestions = {
  suggestions: EsnDirectorySuggestion[]
  /** En train de chercher — ni « rien trouvé », ni « source muette ». */
  loading: boolean
  /**
   * Le référentiel n'a pas RÉPONDU.
   *
   * À ne jamais confondre avec « rien ne correspond » : une liste vide se croit,
   * une panne se remarque. C'est la leçon de #1107/#1109 sur l'autre
   * autocomplétion, reprise ici avant de la repayer.
   */
  sourceUnavailable: boolean
}

export function useEsnDirectorySuggestions(query: string): EsnDirectorySuggestions {
  const [debouncedQuery] = useDebounce(query, DEBOUNCE_MS)

  const trimmed = query.trim()
  const debouncedTrimmed = debouncedQuery.trim()
  const enabled = debouncedTrimmed.length >= ESN_SUGGEST_MIN_QUERY_LENGTH
  // Entre la frappe et la fin du délai : l'attente s'affiche tout de suite,
  // plutôt qu'au départ de la requête.
  const isDebouncing = trimmed.length >= ESN_SUGGEST_MIN_QUERY_LENGTH && trimmed !== debouncedTrimmed

  const { data, isFetching, isError } = useQuery<EsnDirectorySuggestResponse>({
    queryKey: ['esn-directory', 'suggest', debouncedTrimmed],
    queryFn: () =>
      apiFetch<EsnDirectorySuggestResponse>({
        path: `/territory/esn/suggest?q=${encodeURIComponent(debouncedTrimmed)}`,
      }),
    enabled,
    staleTime: 60_000,
    placeholderData: previous => previous,
  })

  return {
    suggestions: enabled ? (data?.suggestions ?? []) : [],
    loading: isDebouncing || (enabled && isFetching),
    sourceUnavailable: enabled && !isFetching && isError,
  }
}

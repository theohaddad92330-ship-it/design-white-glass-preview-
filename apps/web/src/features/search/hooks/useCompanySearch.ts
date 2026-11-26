import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { CompanySearchLens, CompanySearchResponse, CompanySuggestion, WorkspaceMarket } from '@bellum/contracts'
import { useDebounce } from '@/hooks/useDebounce'
import { companiesApi, companyKeys } from '@/features/search/api'

// #1688.2 — exportée pour que `Search.tsx` sache reconnaître une recherche
// RÉELLEMENT tentée (donc digne d'un `trackSearchPerformed`) d'une simple
// frappe trop courte pour interroger la source : un réglage vit à un seul
// endroit (GA-26), jamais recopié en dur dans l'écran.
export const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 300
const LIMIT = 5

type CompanySearch = {
  suggestions: CompanySuggestion[]
  /**
   * La requête RÉELLEMENT servie, quand la saisie exacte n'a rien donné (#1099).
   * L'écran l'affiche : sans ça, il ferait passer une autre recherche pour
   * celle qui a été demandée.
   */
  broadenedFrom: string | undefined
  /**
   * La source n'a pas RÉPONDU — à ne jamais confondre avec « rien trouvé ».
   *
   * #1107/#1109 : « Bizarre, il ne trouve pas la mutuelle prévoir », puis
   * « Tjs réseau et/ou lien KO. S'il y a effectivement un pb, faudrait une
   * notification en ce sens ». Le hook jetait l'état d'erreur de `useQuery` et
   * l'API repliait son échec sur une liste vide : l'écran affirmait alors
   * « Aucune entreprise trouvée » sur une entreprise que le registre connaît
   * parfaitement. Une erreur se remarque, une liste vide se croit.
   */
  sourceUnavailable: boolean
  loading: boolean
  search: (value: string) => void
  clearSuggestions: () => void
}

/**
 * Autocomplete suggestions backed by `GET /companies/search` (web → API → IA →
 * Pappers). The previous implementation hit Pappers directly with a
 * `VITE_PAPPERS_API_KEY` exposed in the bundle — fixed by routing everything
 * through the authenticated API.
 *
 * - `useDebounce` waits 300ms of typing pause before firing.
 * - `useQuery` dedupes overlapping requests, caches per query, retries on
 *   transient failures.
 * - `clearSuggestions` is exposed because `Search.tsx` clears the dropdown on
 *   selection / submission without changing the input value.
 */
export function useCompanySearch(country: WorkspaceMarket = 'FR', lens?: CompanySearchLens): CompanySearch {
  const [query, setQuery] = useState<string>('')
  const [debouncedQuery] = useDebounce(query, DEBOUNCE_MS)
  const qc = useQueryClient()

  const trimmed = query.trim()
  const debouncedTrimmed = debouncedQuery.trim()
  const enabled: boolean = debouncedTrimmed.length >= MIN_QUERY_LENGTH
  // True between keystroke and debounce flush — useful so the spinner shows
  // immediately rather than only once the request is in flight.
  const isDebouncing = trimmed.length >= MIN_QUERY_LENGTH && trimmed !== debouncedTrimmed

  const { data, isFetching, isError, isPlaceholderData } = useQuery<CompanySearchResponse>({
    // `country` is part of the key so switching the market flag re-queries the
    // matching registry instead of serving the previous country's suggestions.
    queryKey: companyKeys.search(debouncedQuery, LIMIT, country, lens),
    queryFn: (): Promise<CompanySearchResponse> => companiesApi.search(debouncedQuery, LIMIT, country, lens),
    enabled,
    staleTime: 60_000,
    placeholderData: previous => previous,
  })

  const search = useCallback((value: string) => {
    setQuery(value)
  }, [])

  const clearSuggestions = useCallback(() => {
    setQuery('')
    qc.removeQueries({ queryKey: companyKeys.all })
  }, [qc])

  // La liste affichée est TOUJOURS celle de la dernière frappe (react-query ignore les réponses
  // périmées : la clé porte la requête). Pendant l'attente, on ne garde PAS l'ancienne liste en
  // placeholder : elle serait remplacée sous le pointeur et le clic tomberait sur une autre entité
  // (« BOULANGER » → « BOULANGERIES PAUL », recette 01/11). Les lignes se choisissent par objet/SIREN.
  const current = enabled && !isPlaceholderData && !isDebouncing

  return {
    suggestions: current ? (data?.suggestions ?? []) : [],
    broadenedFrom: current ? data?.broadenedFrom : undefined,
    // Les deux moitiés de la même vérité : la requête elle-même a échoué
    // (réseau, 5xx), ou elle a abouti et le serveur avoue que la source n'a pas
    // répondu. En vol, on n'affirme rien — c'est encore en train de chercher.
    sourceUnavailable: enabled && !isFetching && (isError || data?.sourceUnavailable === true),
    loading: isDebouncing || (enabled && isFetching),
    search,
    clearSuggestions,
  }
}

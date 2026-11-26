import { useEffect, useMemo, useState } from 'react'
import { accountsApi } from '@/features/accounts/api'
import { useDebounce } from '@/hooks/useDebounce'
import { useSession } from '@/lib/hooks/use-session'

/** La forme qu'on garde d'un compte pour la portée — un sous-ensemble de `GET /accounts`. */
type ScopeRow = {
  id: string
  company_name?: string | null
  priority_score?: number | null
  logo_url?: string | null
  website?: string | null
  status?: string | null
  commercial_status?: string | null
  last_analyzed_at?: string | null
  signal_preview?: { label: string } | null
}

/** Les lignes `extra` qui ne sont pas déjà dans `base` ; `base` gagne (ses données sont plus fraîches). */
export function mergeScopeRows<A extends { id: string }, B extends { id: string }>(
  base: readonly A[],
  extra: readonly B[],
): (A | B)[] {
  const seen = new Set(base.map(row => row.id))
  return [...base, ...extra.filter(row => !seen.has(row.id))]
}

/**
 * #3654.1 — les comptes ANALYSÉS que la première page de `/accounts` ne contient pas.
 *
 * ⚠️ Le chat ne charge qu'une page de comptes. Un compte analysé au-delà de
 * cette page n'était ni résolu par `?accountId=` (en-tête « Un compte », accueil
 * global — le périmètre se perdait en silence) ni trouvé dans le sélecteur
 * (« Aucun compte ne correspond »). Deux lectures ciblées plutôt que de charger
 * tout le portefeuille : le compte du lien, par son identifiant ; la recherche
 * tapée, par le serveur. Rien n'est inventé : un compte introuvable reste absent.
 */
export function useScopeAccountLookup({
  accountId,
  loadedIds,
  query,
}: {
  accountId: string | null
  loadedIds: readonly string[]
  query: string
}): ScopeRow[] {
  const { user } = useSession()
  const [needle] = useDebounce(query.trim(), 250)
  const missing = !!accountId && !loadedIds.includes(accountId)
  const [byId, setById] = useState<ScopeRow | null>(null)
  const [bySearch, setBySearch] = useState<readonly ScopeRow[]>([])
  const userId = user?.id

  // Deux lectures ciblées, sans QueryClient : `Chat` se monte aussi là où seul
  // `useAccounts` est fourni (démo, tests d'écran). Une réponse tardive d'une
  // recherche périmée est écartée (`cancelled`).
  useEffect(() => {
    if (!userId || !missing || !accountId) {
      setById(null)
      return
    }
    let cancelled = false
    accountsApi
      .getOne(accountId)
      .then(row => !cancelled && setById(row))
      .catch(() => !cancelled && setById(null))
    return () => {
      cancelled = true
    }
  }, [userId, missing, accountId])

  useEffect(() => {
    if (!userId || needle.length === 0) {
      setBySearch([])
      return
    }
    let cancelled = false
    accountsApi
      .list({ q: needle, status: 'completed', limit: 25, offset: 0 })
      .then(page => !cancelled && setBySearch(page.data))
      .catch(() => !cancelled && setBySearch([]))
    return () => {
      cancelled = true
    }
  }, [userId, needle])

  return useMemo(() => mergeScopeRows(byId && missing ? [byId] : [], bySearch), [byId, bySearch, missing])
}

/** Le nom du compte en portée dans les lignes connues, sinon `null` — jamais un nom deviné. */
export function resolveScopeAccountName(
  accountId: string | null,
  rows: readonly { id: string; company_name?: string | null }[],
): string | null {
  if (!accountId) return null
  return rows.find(row => row.id === accountId)?.company_name ?? null
}

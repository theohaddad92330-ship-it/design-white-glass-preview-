import { isAccountIntelligenceUnavailable, type AccountIntelligenceContextView } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #2116 — LE contexte canonique d'un dossier, lu par l'écran qui le montre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE HOOK FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /accounts/:id/intelligence-context` est exposée depuis #1618, testée,
 * cloisonnée par espace — et `grep intelligenceContext apps/web/src` rendait
 * ZÉRO. Pendant ce temps l'ESN en place, les technologies et le chemin d'accès
 * se re-dérivaient dans les écrans, le chemin d'accès DEUX fois. Ce hook est
 * l'appelant qui manquait ; les sections lisent sa réponse telle quelle.
 *
 * Il rend `null` sur une façade absente (`{ status: 'unavailable' }`) : l'écran
 * doit alors se TAIRE sur ces faits, pas afficher « aucune ESN en place ».
 */
export function useAccountIntelligenceContext(accountId: string | undefined) {
  const { user } = useSession()

  return useQuery<AccountIntelligenceContextView | null>({
    // #2786/#2126.62 — clé PARTAGÉE avec `usePatchAccount` (`accountKeys.
    // intelligenceContext`) : c'est elle qui invalide cette lecture quand une
    // correction touche ce compte, sans quoi la façade resterait sourde à sa
    // propre source de vérité.
    queryKey: accountKeys.intelligenceContext(accountId),
    queryFn: async () => {
      const response = await accountsApi.getIntelligenceContext(accountId!)
      // ⚠️ `null`, jamais `undefined` : React Query v5 refuse un `queryFn` qui
      // rend `undefined` (« Query data cannot be undefined ») et la requête
      // partirait en `isError` — l'écran annoncerait une PANNE là où la
      // réponse honnête est « cette lecture n'est pas disponible ».
      return isAccountIntelligenceUnavailable(response) ? null : (response ?? null)
    },
    enabled: Boolean(accountId) && !!user,
    staleTime: 5 * 60_000,
    /** Aucune reprise : une façade non montée est une RÉPONSE, pas un incident
     *  réseau — la rejouer trois fois ne la monte pas et retarde l'écran. */
    retry: false,
  })
}

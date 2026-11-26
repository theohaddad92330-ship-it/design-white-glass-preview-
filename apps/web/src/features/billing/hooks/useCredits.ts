import { useCredits as useCreditsQuery } from '@/features/credits/hooks/useCredits'

interface UserCreditsSummary {
  plan: string
  accounts_used: number
  accounts_limit: number
  enrichment_credits: number
  /**
   * Le solde et la capacité CANONIQUES — recopiés tels quels.
   *
   * Cette vue réduite les oubliait, si bien que la pastille de crédits et la
   * note de coût de la recherche retombaient toutes deux sur `accounts_limit −
   * accounts_used`, qui ignore le REPORT du cycle précédent. Un client à qui l'on
   * avait reporté des crédits les voyait manquer à l'écran, et la note de
   * lancement lui annonçait « Crédits épuisés » pendant que le serveur, lui,
   * acceptait le run. Un normaliseur qui avale un champ neuf rend une
   * fonctionnalité invisible sans faire échouer un seul test.
   */
  credits_remaining?: number
  credits_limit?: number
  /** Espace de démonstration — les surfaces de vente (UpgradeCard…) se masquent. */
  is_demo?: boolean
}

/**
 * Back-compat adapter for `{ credits, loading }` consumers (Sidebar, Header).
 * New code should use `useCredits` from `@/features/credits/hooks/useCredits`
 * directly and read `data`/`isLoading`.
 *
 * `credits` is `null` while the balance is unknown — in flight OR failed. It
 * used to fall back to a hardcoded `{ plan: 'trial', accounts_limit: 40,
 * enrichment_credits: 75 }`, so every consumer rendered an invented quota as if
 * it were the user's own. Callers must branch on `null` and show an explicit
 * "unavailable" state rather than a number.
 */
export function useCredits(): { credits: UserCreditsSummary | null; loading: boolean; failed: boolean } {
  const { data, isLoading, isError } = useCreditsQuery()
  const credits: UserCreditsSummary | null = data
    ? {
        plan: data.plan ?? 'trial',
        accounts_used: data.accounts_used ?? 0,
        // A missing limit is NOT "40" and NOT "0" — but the field is required
        // server-side, so this branch only guards against a malformed payload.
        accounts_limit: data.accounts_limit ?? 0,
        enrichment_credits: data.enrichment_credits ?? 0,
        // Recopiés SANS repli : absents de la réponse, ils restent absents, et
        // les lecteurs retombent sur les alias historiques. Un `?? 0` ici
        // transformerait « on ne sait pas » en « épuisé ».
        credits_remaining: data.credits_remaining,
        credits_limit: data.credits_limit,
        is_demo: data.is_demo === true,
      }
    : null
  return { credits, loading: isLoading, failed: isError }
}

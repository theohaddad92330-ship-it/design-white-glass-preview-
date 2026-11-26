import type { UseQueryResult } from '@tanstack/react-query'
import type { SimilarAccountSuggestion } from '@bellum/contracts'
import { useSimilarAccountsToExplore } from '@/features/accounts/hooks/useSimilarAccountsToExplore'

/**
 * Suggestions prêtes à l'ouverture de l'app, alimentant l'onglet « Similaires »
 * et l'indicateur « préparation » de la barre latérale.
 *
 * La v1 déclenchait ici un appel Claude de 15-20 s dès l'entrée dans l'app,
 * dont le résultat — noms d'entreprises inclus — était généré par le LLM, puis
 * mis en cache 6 h pour ne pas le repayer. La v2 lit à la place le portefeuille
 * réel du commercial (`GET /accounts/similar-to-explore`) : instantané, gratuit,
 * et chaque suggestion s'appuie sur un compte qui existe vraiment.
 *
 * Le contrat de retour reste un `UseQueryResult` — la barre latérale n'en
 * consomme que `isLoading`.
 */
export function useDefaultDiscover(): UseQueryResult<SimilarAccountSuggestion[]> {
  // perf P3 (29/09/2026) — préchauffage de la barre latérale, montée sur CHAQUE page :
  // il attend que la page soit calme (l'écran Découvrir lit la même clé et lance
  // sa propre lecture tout de suite).
  return useSimilarAccountsToExplore({ deferred: true })
}

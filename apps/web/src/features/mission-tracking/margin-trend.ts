import { useQueries } from '@tanstack/react-query'
import { financeApi, missionKeys } from '@/features/missions/api'

/**
 * LA TENDANCE DE MARGE — un point RÉEL par mois, jamais un chiffre inventé
 * pour remplir un trimestre ou une année.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI SEULEMENT « MOIS », ET PAS « TRIMESTRE » NI « ANNÉE »
 * ─────────────────────────────────────────────────────────────────────────
 * `GET /delivery/finance/margin` est MENSUEL — comme `/invoice-readiness`. Il
 * n'existe aucune agrégation trimestrielle ou annuelle côté serveur, et en
 * FABRIQUER une ici (une moyenne de pourcentages mensuels, par exemple) serait
 * une dérivation NEUVE que personne n'a validée — une marge trimestrielle se
 * pondère par le chiffre d'affaires de chaque mois, pas par une moyenne
 * arithmétique de trois taux. GA-26 : une dérivation vit à un seul endroit, et
 * ce n'est pas dans ce fichier. Le panneau qui consomme ce hook affiche donc
 * la vraie fenêtre MENSUELLE quoi qu'on choisisse dans la bascule, et dit
 * « non mesuré » sur Trimestre/Année plutôt que d'inventer un chiffre lissé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA FENÊTRE, ET SA TOLÉRANCE
 * ─────────────────────────────────────────────────────────────────────────
 * Même patron que `useCollectionsWindow` (`@/features/missions/api`) : un fan-
 * out BORNÉ de requêtes mensuelles, partageant la clé de cache de
 * `useAggregateMargin` — un mois déjà ouvert sur `/pilotage/finance` ne
 * recharge pas ici. Un mois en échec (droit financier absent, panne) ne fait
 * pas échouer les autres : il reste `null`, marginé « non mesuré », jamais
 * confondu avec un mois encore EN CHARGEMENT.
 */
type MonthlyMargin = { month: string; marginPercent: number | null; isLoading: boolean }

/** `count` mois, du plus ANCIEN au plus RÉCENT (l'ordre d'un axe de temps
 *  lu de gauche à droite) — se terminant au mois précédent `now`, le même
 *  défaut serveur que `useAggregateMargin()` sans argument. */
export function monthsBack(now: Date, count: number): string[] {
  const months: string[] = []
  for (let back = 1; back <= count; back += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    date.setUTCMonth(date.getUTCMonth() - back)
    months.push(date.toISOString().slice(0, 7))
  }
  return months.reverse()
}

export function useMarginTrend(months: readonly string[]): { items: MonthlyMargin[]; isLoading: boolean } {
  const results = useQueries({
    queries: months.map(month => ({
      queryKey: missionKeys.margin(month),
      queryFn: () => financeApi.margin(month),
      retry: false,
    })),
  })

  const items = months.map((month, index) => ({
    month,
    marginPercent: results[index]?.data?.marginPercent ?? null,
    isLoading: results[index]?.isPending ?? false,
  }))

  return { items, isLoading: results.some(result => result.isPending) }
}

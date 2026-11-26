import type { ExpansionSignal } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiFetch } from '@/lib/api'

/**
 * CE QUE CHAQUE COMPTE PORTE EN DELIVERY : missions actives et personnes en
 * poste (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE LECTURE POUR TOUTE LA PAGE, JAMAIS UNE PAR CARTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La liste affiche vingt-cinq cartes et défile à l'infini : une requête par
 * carte ferait vingt-cinq allers-retours pour deux nombres, et le double au
 * défilement suivant. `GET /delivery/expansion` rend l'espace entier d'un coup,
 * exactement comme `GET /accounts/entities/billing-profiles` le fait pour les
 * dossiers de facturation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ UN COMPTE ABSENT N'EST PAS UN COMPTE À ZÉRO
 * ─────────────────────────────────────────────────────────────────────────────
 * La route ne rend que les comptes qui portent AU MOINS une mission active. Un
 * compte absent n'a donc aucune mission en cours — et là, `0` est VRAI : c'est
 * un stock vide, neutre, pas une alerte et pas une inconnue. La carte l'affiche
 * donc, sans le teinter.
 *
 * En revanche, pendant le chargement ou sur un échec, `get` rend `null` : ni
 * « 0 mission » (qui se lirait comme un fait) ni un tiret muet.
 */

/** NON exporté : les appelants lisent les deux nombres à travers
 *  `AccountExpansionLens`, jamais le type par son nom (règle knip du dépôt). */
type AccountDeliveryCounts = {
  activeMissions: number
  /**
   * Personnes DISTINCTES en poste chez ce client, aujourd'hui.
   *
   * ⚠️ Depuis la réparation du 31/08, ce nombre vient d'un
   * `COUNT(DISTINCT consultant_id)` sur `mission_assignments` — ce n'est plus
   * le nombre de missions sous un autre nom. Un compte dont les missions n'ont
   * aucune affectation enregistrée rend `0` : c'est ce que la table SAIT, et
   * c'est le bandeau — qui dispose de la population — qui refuse d'en tirer un
   * total quand PERSONNE n'est saisi nulle part.
   */
  expertsOnSite: number
}

export type AccountExpansionLens = {
  failed: boolean
  loading: boolean
  /** `null` tant qu'aucun chiffre n'est défendable (chargement ou échec). */
  get(accountId: string): AccountDeliveryCounts | null
}

export function useAccountExpansion(): AccountExpansionLens {
  const query = useQuery({
    queryKey: ['delivery', 'expansion'] as const,
    queryFn: () => apiFetch<{ signals: ExpansionSignal[] }>({ path: '/delivery/expansion' }),
    staleTime: 60_000,
  })

  const byAccount = useMemo(() => {
    if (query.isError || query.isPending) return null
    const map = new Map<string, AccountDeliveryCounts>()
    for (const signal of query.data?.signals ?? []) {
      map.set(signal.accountId, { activeMissions: signal.activeMissions, expertsOnSite: signal.expertsOnSite })
    }
    return map
  }, [query.data, query.isError, query.isPending])

  return {
    failed: query.isError,
    loading: query.isPending,
    get: accountId => {
      if (!byAccount) return null
      // Absent de la réponse = aucune mission active. Un stock vide est un fait,
      // et la carte a le droit de l'écrire.
      return byAccount.get(accountId) ?? { activeMissions: 0, expertsOnSite: 0 }
    },
  }
}

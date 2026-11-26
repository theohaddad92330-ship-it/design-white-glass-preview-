import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { accountsApi } from '@/features/accounts/api'
import { useInvoiceReadiness } from '@/features/missions/api'
import { buildAccountBillingResolver, type AccountBillingBadge } from './accountBillingLens'

/**
 * LA LENTILLE DELIVERY DE `/accounts` — « peut-on facturer ce client ? ».
 *
 * Deux lectures, toutes deux NON PLAFONNÉES et partagées par les vingt-cinq
 * lignes de la page — jamais un appel par ligne :
 *
 *  1. `GET /accounts/entities/billing-profiles` — l'entité DÉSIGNÉE payeuse de
 *     chaque compte, et ce qu'elle porte (SIREN, raison sociale, conditions de
 *     règlement, échéance du contrat, contact de facturation).
 *  2. `useInvoiceReadiness()` — la MÊME clé de cache que la colonne « Prêt à
 *     facturer » voisine, donc aucune requête supplémentaire : on n'en lit que
 *     `missing_po`, le seul des cinq bloqueurs de la source qui appartient déjà
 *     à la moitié « mission ».
 *
 * ⚠️ `failed` ne se lit JAMAIS comme « ce compte est prêt ». Une lecture en
 * échec et un dossier complet se ressemblent si l'on n'y prend pas garde : le
 * second rend un badge vert, la première ne doit rendre AUCUN verdict — `get`
 * répond `null`, et la cellule le dit.
 */
export type AccountBillingLens = {
  /** Une des deux lectures a échoué — l'écran ne conclut rien. */
  failed: boolean
  /** Les lectures sont encore en vol : ni verdict, ni compteur. */
  loading: boolean
  /** `null` tant qu'aucun verdict n'est défendable (chargement ou échec). */
  get(accountId: string): AccountBillingBadge | null
}

export function useAccountBillingLens(): AccountBillingLens {
  const profiles = useQuery({
    queryKey: ['accounts', 'billing-profiles'] as const,
    queryFn: () => accountsApi.listBillingProfiles(),
  })
  const readiness = useInvoiceReadiness()

  const failed = profiles.isError || readiness.isError
  const loading = profiles.isPending || readiness.isPending

  const resolver = useMemo(() => {
    if (failed || loading) return null
    // La date du jour décide de « contrat expiré ». Figée à la construction du
    // résolveur et non relue à chaque appel : deux lignes de la même page
    // doivent être jugées au même instant.
    return buildAccountBillingResolver(profiles.data?.items ?? [], readiness.data?.items ?? [], new Date())
  }, [profiles.data, readiness.data, failed, loading])

  return {
    failed,
    loading,
    get: accountId => resolver?.get(accountId) ?? null,
  }
}
